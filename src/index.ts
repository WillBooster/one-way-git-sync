import child_process from 'child_process';
import fsp from 'fs/promises';
import path from 'path';

import fse from 'fs-extra';
import simpleGit, { SimpleGit } from 'simple-git';
import type { LogResult } from 'simple-git/typings/response';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const SYNC_DIR_PATH = '../sync-git-repo';
const ignoreNames = ['.git', 'node_modules'];

interface Settings {
  dest: string;
  prefix?: string;
  dry?: boolean;
  force?: boolean;
}

export async function cli(argv: string[]): Promise<void> {
  const parsed = await yargs(hideBin(argv)).options({
    dest: {
      type: 'string',
      alias: 'd',
      describe: 'A URL of a destination git repository',
      demand: true,
    },
    prefix: {
      type: 'string',
      alias: 'p',
      describe: `A prefix of a commit hash used to generate a commit message.
                 The typical value is like "https://github.com/WillBooster/one-way-git-sync/commits/"`,
    },
    dry: {
      type: 'boolean',
      describe: 'Enable dry-run mode',
    },
    force: {
      type: 'boolean',
      describe: 'Force to overwrite the destination git repository',
    },
  }).argv;
  await main(parsed);
}

async function main(settings: Settings): Promise<void> {
  // e.g. `--abbrev=0` changes `v1.31.5-2-gcdde507` to `v1.31.5`
  const version = child_process.execSync('git describe --tags --always --abbrev=0').toString().trim();
  if (!/^v\d/.test(version)) {
    console.error('Please run on the `vX.X.X` tag.');
    process.exit(1);
  }

  const srcGit: SimpleGit = simpleGit();

  await fsp.rm(SYNC_DIR_PATH, { recursive: true, force: true });
  await srcGit.clone(settings.dest, SYNC_DIR_PATH, settings.force ? undefined : { '--depth': 1 });
  console.log('Cloned a destination repo.');

  const dstGit: SimpleGit = simpleGit(SYNC_DIR_PATH);
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

  const title = `sync ${version} (${settings.prefix || ''}${latestHash})`;
  const body = srcLog.all.map((l) => `* ${l.message}`).join('\n\n');
  try {
    await dstGit.commit(`${title}\n\n${body}`);
    console.log(`Created a commit: ${title}`);
    console.log(`${body}`);
  } catch (e) {
    console.error('Failed to commit changes:', e);
    process.exit(1);
  }

  try {
    await dstGit.addTag(version);
    console.log(`Created a tag: ${version}`);
  } catch (e) {
    console.error('Failed to commit changes:', e);
    process.exit(1);
  }

  if (settings.dry) {
    console.log('Finished dry run');
    process.exit(0);
  }

  try {
    await dstGit.push();
    await dstGit.push({ '--tags': null });
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
