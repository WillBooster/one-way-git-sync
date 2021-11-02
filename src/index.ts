import child_process from 'child_process';
import fsp from 'fs/promises';
import path from 'path';

import fse from 'fs-extra';
import simpleGit, { SimpleGit } from 'simple-git';
import type { LogResult } from 'simple-git/typings/response';
import { InferredOptionTypes } from 'yargs';

import { yargsOptions } from './yargsOptions';

const SYNC_DIR_PATH = '../sync-git-repo';
const ignoreNames = ['.git', 'node_modules'];

export async function main(opts: InferredOptionTypes<typeof yargsOptions>): Promise<void> {
  const srcGit: SimpleGit = simpleGit();

  await fsp.rm(SYNC_DIR_PATH, { recursive: true, force: true });
  await srcGit.clone(opts.dest, SYNC_DIR_PATH, opts.force ? undefined : { '--depth': 1 });
  console.log('Cloned a destination repo.');

  const dstGit: SimpleGit = simpleGit(SYNC_DIR_PATH);
  if (opts.branch) {
    try {
      await dstGit.checkout(opts.branch);
    } catch (_) {
      await dstGit.checkoutLocalBranch(opts.branch);
    }
  }
  const dstLog = await dstGit.log();

  const from = extractCommitHash(dstLog);
  if (!from) {
    console.error('No valid commit in destination repo.');
    process.exit(1);
  }
  console.log(`Extracted a valid commit: ${from}`);

  let srcLog: LogResult;
  try {
    // '--first-parent' hides children commits of merge commits
    srcLog = await srcGit.log({ from, to: 'HEAD', '--first-parent': undefined });
  } catch (e) {
    console.error('Failed to get source commit history:', e);
    process.exit(1);
  }

  const latestHash = srcLog.latest?.hash;
  if (!latestHash) {
    console.log('No synchronizable commit.');
    process.exit(0);
  }

  for (const name of await fsp.readdir(SYNC_DIR_PATH)) {
    if (ignoreNames.includes(name)) continue;
    await fsp.rm(path.join(SYNC_DIR_PATH, name), { recursive: true, force: true });
  }
  for (const name of await fsp.readdir('.')) {
    if (ignoreNames.includes(name)) continue;
    fse.copySync(name, path.join(SYNC_DIR_PATH, name));
  }
  await dstGit.add('-A');

  let srcTag = '';
  if (opts['tag-hash'] || opts['tag-version']) {
    // e.g. `--abbrev=0` changes `v1.31.5-2-gcdde507` to `v1.31.5`
    const describeCommand = `git describe --tags --always ${opts['tag-version'] ? '--abbrev=0' : ''}`;
    srcTag = child_process.execSync(describeCommand).toString().trim();
  }
  const link = `${opts.prefix || ''}${latestHash}`;
  const title = srcTag ? `sync ${srcTag} (${link})` : `sync ${link}`;
  const body = srcLog.all.map((l) => `* ${l.message}`).join('\n\n');
  try {
    await dstGit.commit(`${title}\n\n${body}`);
    console.log(`Created a commit: ${title}`);
    console.log(`${body}`);
  } catch (e) {
    console.error('Failed to commit changes:', e);
    process.exit(1);
  }

  const destTag = srcTag || opts.tag;
  if (destTag) {
    try {
      await dstGit.addTag(destTag);
      console.log(`Created a tag: ${destTag}`);
    } catch (e) {
      console.error('Failed to commit changes:', e);
      process.exit(1);
    }
  }

  if (opts.dry) {
    console.log('Finished dry run');
    process.exit(0);
  }

  try {
    await dstGit.push();
    if (destTag) {
      await dstGit.push({ '--tags': null });
    }
  } catch (e) {
    console.error('Failed to push a commit:', e);
    process.exit(1);
  }

  console.log('Pushed');
  process.exit(0);
}

function extractCommitHash(logResult: LogResult): string | null {
  if (logResult.all.length === 0) {
    console.error('No commit history.');
    return null;
  }

  for (const log of logResult.all) {
    const [head, ...words] = log.message.replace(/[()]/g, '').split(/[\s/]/);
    if (head === 'sync' && words.length) {
      return words[words.length - 1];
    }
  }
  console.error('No sync commit: ', logResult.all[0]);
  return null;
}
