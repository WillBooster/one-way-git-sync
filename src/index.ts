import child_process from 'child_process';
import fsp from 'fs/promises';
import path from 'path';

import fse from 'fs-extra';
import simpleGit, { SimpleGit } from 'simple-git';
import type { LogResult } from 'simple-git/typings/response';
import { InferredOptionTypes } from 'yargs';

import { logger } from './logger';
import { yargsOptions } from './yargsOptions';

const syncDirPath = path.join('node_modules', '.temp', 'sync-git-repo');
const ignoreNames = ['.git', '.github', 'node_modules'];

export async function sync(opts: InferredOptionTypes<typeof yargsOptions>, init: boolean): Promise<void> {
  await fsp.mkdir(syncDirPath, { recursive: true });
  const dirPath = await fsp.mkdtemp(path.join(syncDirPath, 'repo-'));
  const ret = await syncCore(dirPath, opts, init);
  await fsp.rm(dirPath, { recursive: true, force: true });
  process.exit(ret ? 0 : 1);
}

async function syncCore(
  destRepoPath: string,
  opts: InferredOptionTypes<typeof yargsOptions>,
  init: boolean
): Promise<boolean> {
  const cloneOpts: Record<string, any> = { '--single-branch': undefined };
  if (!opts.force) {
    cloneOpts['--depth'] = 1;
  }
  if (opts.branch) {
    cloneOpts['--branch'] = opts.branch;
  }
  await simpleGit().clone(opts.dest, destRepoPath, cloneOpts);
  logger.verbose(`Cloned a destination repo on ${destRepoPath}`);

  const dstGit: SimpleGit = simpleGit(destRepoPath);
  const dstLog = await dstGit.log();

  let from: string | undefined;
  if (!init) {
    from = extractCommitHash(dstLog);
    if (!from) {
      logger.error('No valid commit in destination repo');
      return false;
    }
    logger.verbose(`Extracted a valid commit: ${from}`);
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
  for (const destFile of destFiles) {
    if (ignoreNames.includes(destFile)) continue;
    await fsp.rm(path.join(destRepoPath, destFile), { recursive: true, force: true });
  }
  for (const srcFile of srcFiles) {
    if (ignoreNames.includes(srcFile)) continue;
    fse.copySync(srcFile, path.join(destRepoPath, srcFile));
  }
  await dstGit.add('-A');

  let srcTag = '';
  if (opts['tag-hash'] || opts['tag-version']) {
    // e.g. `--abbrev=0` changes `v1.31.5-2-gcdde507` to `v1.31.5`
    const describeCommand = `git describe --tags --always ${opts['tag-version'] ? '--abbrev=0' : ''}`;
    srcTag = child_process.execSync(describeCommand).toString().trim();
  }
  let prefix = opts.prefix ?? '';
  if (prefix && !prefix.endsWith('/')) {
    prefix += '/';
  }
  const link = `${prefix}${latestHash}`;
  const title = srcTag ? `sync ${srcTag} (${link})` : `sync ${link}`;
  const body = init
    ? `Initialize one-way-git-sync by replacing all the files with those of ${opts.dest}`
    : srcLog.all.map((l) => `* ${l.message}`).join('\n\n');
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
    await dstGit.push();
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

function extractCommitHash(logResult: LogResult): string | undefined {
  if (logResult.all.length === 0) {
    logger.error('No commit history');
    return;
  }

  for (const log of logResult.all) {
    const [head, ...words] = log.message.replace(/[()]/g, '').split(/[\s/]/);
    if (head === 'sync' && words.length) {
      return words[words.length - 1];
    }
  }
  logger.error(`No sync commit: ${logResult.all[0].message}`);
  return;
}
