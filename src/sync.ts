import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { copy } from 'fs-extra';
import micromatch from 'micromatch';
import type { LogResult, TaskOptions } from 'simple-git';
import { simpleGit, SimpleGit } from 'simple-git';
import { InferredOptionTypes } from 'yargs';

import { getGitHubCommitsUrl } from './gitHub.js';
import { logger } from './logger.js';
import { yargsOptions } from './yargsOptions.js';

const syncDirPath = path.join('node_modules', '.temp', 'sync-git-repo');

export type Options = InferredOptionTypes<typeof yargsOptions>;

export async function sync(opts: Options): Promise<void> {
  await fs.mkdir(syncDirPath, { recursive: true });
  const dirPath = await fs.mkdtemp(path.join(syncDirPath, 'repo-'));
  const ret = await syncCore(dirPath, opts);
  // await fs.rm(dirPath, { recursive: true, force: true });
  process.exit(ret ? 0 : 1);
}

export async function syncCore(destRepoPath: string, opts: Options): Promise<boolean> {
  const cloneOpts: Record<string, any> = { '--single-branch': undefined };
  if (!opts.force) {
    cloneOpts['--depth'] = 1;
  }
  if (opts.branch) {
    cloneOpts['--branch'] = opts.branch;
  }
  try {
    await simpleGit().clone(opts.dest, destRepoPath, cloneOpts);
  } catch {
    delete cloneOpts['--branch'];
    delete cloneOpts['--single-branch'];
    await simpleGit().clone(opts.dest, destRepoPath, cloneOpts);
    simpleGit(destRepoPath).checkout(['-b', opts.branch] as TaskOptions);
  }
  logger.verbose(`Cloned destination repo on ${destRepoPath}`);

  const dstGit: SimpleGit = simpleGit(destRepoPath);
  const dstLog = await dstGit.log();

  const [head, from] = extractCommitHash(dstLog);
  if (from) {
    logger.verbose(`Extracted a valid commit: ${from}`);
    logger.verbose(`(${head})`);
  } else if (!opts.force) {
    logger.error('No valid commit in destination repo');
    return false;
  }

  const srcGit: SimpleGit = simpleGit();
  let srcLog: LogResult;
  try {
    // '--first-parent' hides children commits of merge commits
    srcLog = await srcGit.log(from ? { from, to: 'HEAD', '--first-parent': undefined } : undefined);
  } catch (error) {
    logger.error(`Failed to get source commit history: ${(error as Error).stack}`);
    return false;
  }

  const latestHash = srcLog.latest?.hash;
  if (!latestHash) {
    logger.info('No synchronizable commit');
    return true;
  }

  const [destFiles, srcFiles] = await Promise.all([fs.readdir(destRepoPath), fs.readdir('.')]);
  for (const destFile of micromatch.not(destFiles, opts['ignore-patterns'])) {
    await fs.rm(path.join(destRepoPath, destFile), { recursive: true, force: true });
  }
  for (const srcFile of micromatch.not(srcFiles, opts['ignore-patterns'])) {
    await copy(srcFile, path.join(destRepoPath, srcFile));
  }
  await dstGit.add('-A');

  let srcTag = '';
  if (opts['tag-hash'] || opts['tag-version']) {
    // e.g. `--abbrev=0` changes `v1.31.5-2-gcdde507` to `v1.31.5`
    const describeCommand = `git describe --tags --always ${opts['tag-version'] ? '--abbrev=0' : ''}`;
    srcTag = child_process.execSync(describeCommand).toString().trim();
  }
  let prefix = opts.prefix ?? (await getGitHubCommitsUrl(srcGit)) ?? '';
  if (prefix && !prefix.endsWith('/')) {
    prefix += '/';
  }
  const link = `${prefix}${latestHash}`;
  const title = srcTag ? `sync ${srcTag} (${link})` : `sync ${link}`;
  const body = from
    ? srcLog.all.map((l) => `* ${l.message}`).join('\n\n')
    : `Replace all the files with those of ${opts.dest} due to missing sync commit.`;
  try {
    await dstGit.commit(`${title}\n\n${body}`);
    logger.verbose(`Created a commit: ${title}`);
    logger.verbose(`  with body: ${body}`);
  } catch (error) {
    logger.error(`Failed to commit changes: ${(error as Error).stack}\`);`);
    return false;
  }

  const destTag = srcTag || opts.tag;
  if (destTag) {
    try {
      await dstGit.addTag(destTag);
      logger.verbose(`Created a tag: ${destTag}`);
    } catch (error) {
      logger.error(`Failed to commit changes: ${(error as Error).stack}\`);`);
      return false;
    }
  }

  if (opts.dry) {
    logger.verbose('Finished dry run');
    return true;
  }

  try {
    await (opts.branch ? dstGit.push('origin', opts.branch) : dstGit.push());
    if (destTag) {
      await dstGit.push({ '--tags': null });
    }
  } catch (error) {
    logger.error(`Failed to push the commit: ${(error as Error).stack}`);
    return false;
  }

  logger.verbose('Pushed the commit');
  return true;
}

function extractCommitHash(logResult: LogResult): [string, string] | [] {
  if (logResult.all.length === 0) {
    logger.verbose('No commit history');
    return [];
  }

  for (const log of logResult.all) {
    const [head, ...words] = log.message.replaceAll(/[()]/g, '').split(/[\s/]/);
    if (head === 'sync' && words.length > 0) {
      return [log.message, words.at(-1) as string];
    }
  }
  logger.verbose(`No sync commit: ${logResult.all[0].message}`);
  return [];
}
