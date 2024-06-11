import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { beforeEach, expect, test } from 'vitest';

import { syncCore } from '../src/sync.js';

import {
  DEFAULT_OPTIONS,
  LOCAL_DEST_DIR,
  LOCAL_SRC_DIR,
  REMOTE_DEST_DIR,
  REMOTE_SRC_DIR,
  TEMP_DIR,
} from './constants.js';
import { createRepoDir, setUpGit } from './shared.js';

beforeEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
  await fs.mkdir(LOCAL_SRC_DIR, { recursive: true });
  await fs.mkdir(LOCAL_DEST_DIR, { recursive: true });
  await fs.mkdir(REMOTE_SRC_DIR, { recursive: true });
  await fs.mkdir(REMOTE_DEST_DIR, { recursive: true });

  await setUpGit();

  const remoteDestGit = simpleGit(REMOTE_DEST_DIR);
  await remoteDestGit.init(true, ['--initial-branch=main']);

  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.clone(REMOTE_DEST_DIR, LOCAL_DEST_DIR);

  const remoteSrcGit = simpleGit(REMOTE_SRC_DIR);
  await remoteSrcGit.init(true, ['--initial-branch=main']);

  const localSrcGit = simpleGit(LOCAL_SRC_DIR);
  await localSrcGit.clone(REMOTE_SRC_DIR, LOCAL_SRC_DIR);

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');
  await localSrcGit.push(['-u', 'origin', 'main']);
});

test('Work one-way-git-sync --force to an empty repo', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, verbose: true, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  ret = await syncCore(await createRepoDir(), DEFAULT_OPTIONS, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const syncedSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(syncedSrcFilePath)).resolves.not.toThrow();
  const syncedSrcFileContent = await fs.readFile(syncedSrcFilePath, 'utf8');
  expect(syncedSrcFileContent).toBe('Src Repository');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(
    `Replace all the files with those of ${DEFAULT_OPTIONS.dest} due to missing sync commit.\n`
  );

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});
