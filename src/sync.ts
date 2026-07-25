import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { copy } from 'fs-extra';
import micromatch from 'micromatch';
import type { LogResult, Options, SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';
import type { InferredOptionTypes } from 'yargs';

import { getGitHubCommitsUrl } from './gitHub.js';
import { logger } from './logger.js';
import type { yargsOptions } from './yargsOptions.js';

const syncDirPath = path.join('node_modules', '.temp', 'sync-git-repo');

export type YargsOptions = InferredOptionTypes<typeof yargsOptions>;

export async function sync(opts: YargsOptions): Promise<void> {
  await fs.mkdir(syncDirPath, { recursive: true });
  const dirPath = await fs.mkdtemp(path.join(syncDirPath, 'repo-'));
  const ret = await syncCore(dirPath, opts);
  // await fs.rm(dirPath, { recursive: true, force: true });
  process.exit(ret ? 0 : 1);
}

export async function syncCore(
  destRepoPath: string,
  opts: YargsOptions,
  srcRepoPath = process.cwd()
): Promise<boolean> {
  // eslint-disable-next-line unicorn/no-null
  const cloneOpts: Options = { '--single-branch': null };
  if (!opts.force) {
    cloneOpts['--depth'] = 1;
  }
  if (opts.branch) {
    cloneOpts['--branch'] = opts.branch;
  }
  try {
    await simpleGit(srcRepoPath).clone(opts.dest, destRepoPath, cloneOpts);
  } catch (error) {
    // This fallback exists for one case: --branch names a branch the destination does not have yet,
    // so the narrow clone cannot find it and the branch has to be created locally instead. The
    // clone can equally fail for unrelated reasons (a flaky network, a bad URL, missing auth), in
    // which case there is no branch to create — hence the conditional below. Creating it
    // unconditionally used to read `checkout(['-b', undefined])`, which simple-git renders as
    // `-b undefined`, so a transient network error silently turned into a commit pushed to a branch
    // literally named "undefined" while the real branch stayed behind. simple-git's permissive
    // `checkout` overloads accept the undefined, so the compiler does not catch it.
    delete cloneOpts['--branch'];
    delete cloneOpts['--single-branch'];
    // Reported for BOTH cases, before the retry: whichever one this was, discarding the original
    // error is what let the bug above go unnoticed, and a --branch run that fails for an unrelated
    // reason ends up syncing from the wrong history with no other trace of why.
    // Only --branch is named because --depth (set for every non-force run) implies --single-branch,
    // so deleting the latter changes nothing unless --force also dropped --depth.
    // `error` is whatever simple-git rejected with, which is always a GitError (an Error subclass);
    // the cast documents that rather than guarding an unreachable shape.
    const reason = redactUrlCredentials((error as Error).message);
    logger.warn(`Retrying the clone ${opts.branch ? 'without --branch ' : ''}after: ${reason}`);
    await simpleGit(srcRepoPath).clone(opts.dest, destRepoPath, cloneOpts);
    if (opts.branch) {
      const retryGit = simpleGit(destRepoPath);
      // The retry dropped --branch, so it landed on the destination's DEFAULT branch. When that is
      // the requested branch (--branch main, the common case) there is nothing left to do.
      const headRef = await retryGit.revparse(['--abbrev-ref', 'HEAD']);
      const currentBranch = headRef.trim();
      if (currentBranch !== opts.branch) {
        // The requested branch existing on the remote means the first clone did not fail because it
        // was missing — so this was an unrelated failure, and creating the branch here would point
        // it at the default branch's tip. That silently syncs from the wrong history: a diverged
        // branch is rejected on push with a misleading error, and one that is an ancestor of the
        // default branch fast-forwards and absorbs its commits while reporting success.
        const remoteHeads = await retryGit.listRemote(['--heads', 'origin', opts.branch]);
        if (remoteHeads.trim()) {
          logger.error(`Cloning failed and branch ${opts.branch} already exists on the destination: ${reason}`);
          return false;
        }
        // Absent from the remote, so this is the case the fallback exists for. -b would do here too;
        // -B just avoids depending on the fresh clone never having the branch locally.
        await retryGit.checkout(['-B', opts.branch]);
      }
    }
  }
  logger.debug(`Cloned destination repo on ${destRepoPath}`);

  const dstGit: SimpleGit = simpleGit(destRepoPath);
  let commitHashResult: [string, string] | [] = [];
  try {
    const dstLog = await dstGit.log();
    commitHashResult = extractCommitHash(dstLog);
  } catch {
    // do nothing
  }
  const [head, from] = commitHashResult;
  let logFrom = from;
  if (from) {
    logger.debug(`Extracted a valid commit: ${from}`);
    logger.debug(`(${head})`);
  } else if (!opts.force) {
    logger.error('No valid commit in destination repo');
    return false;
  }

  const srcGit: SimpleGit = simpleGit(srcRepoPath);
  let srcLog: LogResult;
  try {
    // '--first-parent' hides children commits of merge commits
    srcLog = await srcGit.log(logFrom ? { from: logFrom, to: 'HEAD', '--first-parent': undefined } : undefined);
  } catch (error) {
    if (opts.force) {
      logger.warn(`Failed to get source commit history from ${from}; falling back to full sync`);
      srcLog = await srcGit.log();
      logFrom = undefined;
    } else {
      logger.error(`Failed to get source commit history: ${(error as Error).stack}`);
      return false;
    }
  }

  const latestHash = srcLog.latest?.hash;
  if (!latestHash) {
    logger.info('No synchronizable commit');
    return true;
  }

  // Force to ignore .git directory
  const ignorePatterns = [...new Set([...opts['ignore-patterns'].map(String), '.git'])];
  let [destFiles, srcFiles] = await Promise.all([fs.readdir(destRepoPath), fs.readdir(srcRepoPath)]);
  destFiles = micromatch.not(destFiles, ignorePatterns);
  srcFiles = micromatch.not(srcFiles, ignorePatterns);
  logger.debug('destFiles: %o', destFiles);
  logger.debug('srcFiles: %o', srcFiles);
  for (const destFile of destFiles) {
    await fs.rm(path.join(destRepoPath, destFile), { recursive: true, force: true });
  }
  for (const srcFile of srcFiles) {
    await copy(path.join(srcRepoPath, srcFile), path.join(destRepoPath, srcFile));
  }
  await dstGit.add('-A');

  let srcTag = '';
  if (opts['tag-hash'] || opts['tag-version']) {
    // e.g. `--abbrev=0` changes `v1.31.5-2-gcdde507` to `v1.31.5`
    const describeCommand = `git describe --tags --always ${opts['tag-version'] ? '--abbrev=0' : ''}`;
    srcTag = child_process.execSync(describeCommand, { cwd: srcRepoPath }).toString().trim();
  }
  let prefix = opts.prefix ?? (await getGitHubCommitsUrl(srcGit)) ?? '';
  if (prefix && !prefix.endsWith('/')) {
    prefix += '/';
  }
  const link = `${prefix}${latestHash}`;
  const title = srcTag ? `sync ${srcTag} (${link})` : `sync ${link}`;
  const body = logFrom
    ? srcLog.all.map((l) => `* ${l.message}`).join('\n\n')
    : `Replace all the files with those of ${opts.dest} due to missing sync commit.`;
  try {
    const ret = await dstGit.commit(`${title}\n\n${body}`);
    logger.debug(`Created a commit: %o`, ret);
    logger.debug(title);
    logger.debug(`  with body: ${body}`);
  } catch (error) {
    logger.error(`Failed to commit changes: ${(error as Error).stack}`);
    return false;
  }

  const destTag = srcTag || opts.tag;
  if (destTag) {
    try {
      await dstGit.addTag(destTag);
      logger.debug(`Created a tag: ${destTag}`);
    } catch {
      // Ignore the error since `--abbrev=0` may yield a tag that already exists
      logger.warn(`Failed to create a tag: ${destTag}`);
    }
  }

  if (opts.dry) {
    logger.debug('Finished dry run');
    return true;
  }

  try {
    await (opts.branch ? dstGit.push('origin', opts.branch) : dstGit.push());
    if (destTag) {
      // eslint-disable-next-line unicorn/no-null
      await dstGit.push({ '--tags': null });
    }
  } catch (error) {
    logger.error(`Failed to push the commit: ${(error as Error).stack}`);
    return false;
  }

  logger.debug('Pushed the commit');
  return true;
}

function extractCommitHash(logResult: LogResult): [string, string] | [] {
  if (logResult.all.length === 0) {
    logger.debug('No commit history');
    return [];
  }

  for (const log of logResult.all) {
    const [head, ...words] = log.message.replaceAll(/[()]/g, '').split(/[\s/]/);
    if (head === 'sync' && words.length > 0) {
      return [log.message, words.at(-1) as string];
    }
  }
  const [firstLog] = logResult.all;
  if (firstLog) {
    logger.debug(`No sync commit: ${firstLog.message}`);
  }
  return [];
}

/**
 * Replaces the `user:password@` part of every URL in the text. The README recommends passing the
 * destination as `https://oauth2:<PAT>@github.com/...`, and git echoes the URL back in its error
 * messages, so logging either one verbatim would print the token into console and CI logs.
 */
export function redactUrlCredentials(text: string): string {
  return text.replaceAll(/([A-Za-z][\w+.-]*:\/\/)[^/\s]*@/g, '$1***@');
}
