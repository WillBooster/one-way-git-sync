import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { expect, test, beforeEach, afterEach } from 'vitest';

import { syncCore } from '../src/sync.js';

import { LOCAL_DEST, LOCAL_SRC, REMOTE_DEST, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_SRC), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_DEST), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, REMOTE_DEST), { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
});

test('can initialize git sync', async () => {
  process.chdir(path.join(TEMP_DIR, REMOTE_DEST));
  const remoteDestGit = simpleGit();
  await remoteDestGit.init(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();
  await localDestGit.init();
  await localDestGit.remote(['add', 'origin', path.join(TEMP_DIR, REMOTE_DEST)]);

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit('Initial commit');
  await localDestGit.push(['-u', 'origin', 'main']);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();
  await localSrcGit.init();

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');

  const ret = await syncCore(path.join(TEMP_DIR, 'work'), {
    dest: path.join(TEMP_DIR, REMOTE_DEST),
    'ignore-patterns': ['.git', '.github', 'node_modules', '.renovaterc.*'],
    prefix: undefined,
    branch: undefined,
    tag: undefined,
    'tag-hash': undefined,
    'tag-version': undefined,
    dry: undefined,
    force: true,
    verbose: undefined,
  });

  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  const srcLog = await localSrcGit.log();
  const dstLog = await localDestGit.log();
  expect(dstLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
});
