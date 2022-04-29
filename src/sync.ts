import child_process from 'child_process';
import fsp from 'fs/promises';
import path from 'path';

import fse from 'fs-extra';
import micromatch from 'micromatch';
import type { LogResult, TaskOptions } from 'simple-git';
import simpleGit, { SimpleGit } from 'simple-git';
import { InferredOptionTypes } from 'yargs';

import { getGitHubCommitsUrl } from './gitHub';
import { logger } from './logger';
import { yargsOptions } from './yargsOptions';

const syncDirPath = path.join('node_modules', '.temp', 'sync-git-repo');

export async function sync(opts: InferredOptionTypes<typeof yargsOptions>): Promise<void> {
  await fsp.mkdir(syncDirPath, { recursive: true });
  const dirPath = await fsp.mkdtemp(path.join(syncDirPath, 'repo-'));
  const ret = await syncCore(dirPath, opts);
  // await fsp.rm(dirPath, { recursive: true, force: true });
  process.exit(ret ? 0 : 1);
}

async function syncCore(destRepoPath: string, opts: InferredOptionTypes<typeof yargsOptions>): Promise<boolean> {
  const cloneOpts: Record<string, any> = { '--single-branch': undefined };
  if (!opts.force) {
    cloneOpts['--depth'] = 1;
  }
  if (opts.branch) {
    cloneOpts['--branch'] = opts.branch;
  }
  try {
    await simpleGit().clone(opts.dest, destRepoPath, cloneOpts);
  } catch (e) {
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
  } catch (e) {
    logger.error(`Failed to get source commit history: ${(e as Error).stack}`);
    return false;
  }

  const latestHash = srcLog.latest?.hash;
  if (!latestHash) {
    logger.info('No synchronizable commit');
    return true;
  }

  const [destFiles, srcFiles] = await Promise.all([fsp.readdir(destRepoPath), fsp.readdir('.')]);
  for (const destFile of micromatch.not(destFiles, opts['ignore-patterns'])) {
    await fsp.rm(path.join(destRepoPath, destFile), { recursive: true, force: true });
  }
  for (const srcFile of micromatch.not(srcFiles, opts['ignore-patterns'])) {
    fse.copySync(srcFile, path.join(destRepoPath, srcFile));
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
  } catch (e) {
    logger.error(`Failed to commit changes: ${(e as Error).stack}\`);`);
    return false;
  }

  const destTag = srcTag || opts.tag;
  if (destTag) {
    try {
      await dstGit.addTag(destTag);
      logger.verbose(`Created a tag: ${destTag}`);
    } catch (e) {
      logger.error(`Failed to commit changes: ${(e as Error).stack}\`);`);
      return false;
    }
  }

  if (opts.dry) {
    logger.verbose('Finished dry run');
    return true;
  }

  try {
    if (opts.branch) {
      await dstGit.push('origin', opts.branch);
    } else {
      await dstGit.push();
    }
    if (destTag) {
      await dstGit.push({ '--tags': null });
    }
  } catch (e) {
    logger.error(`Failed to push the commit: ${(e as Error).stack}`);
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
    const [head, ...words] = log.message.replace(/[()]/g, '').split(/[\s/]/);
    if (head === 'sync' && words.length) {
      return [log.message, words[words.length - 1]];
    }
  }
  logger.verbose(`No sync commit: ${logResult.all[0].message}`);
  return [];
}
