import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { expect, test, beforeEach, afterEach } from 'vitest';

import { syncCore } from '../src/sync.js';

import { DEFAULT_OPTIONS, LOCAL_DEST, LOCAL_SRC, REMOTE_DEST, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_SRC), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_DEST), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, REMOTE_DEST), { recursive: true });

  process.chdir(path.join(TEMP_DIR, REMOTE_DEST));
  const remoteDestGit = simpleGit();
  await remoteDestGit.init(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();
  await localDestGit.init();
  await localDestGit.remote(['add', 'origin', path.join(TEMP_DIR, REMOTE_DEST)]);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();
  await localSrcGit.init();
});

afterEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
});

test.skip.each<{ label: string; force: boolean }>([
  { label: 'normal', force: false },
  { label: 'force', force: true },
])('can report error when no commit exists ($label)', async ({ force }) => {
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force });
  expect(ret).toBe(false);
});

test('can report error when no sync commit exists', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit('Initial commit');
  await localDestGit.push(['-u', 'origin', 'main']);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');

  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS });
  expect(ret).toBe(false);
});

function createRepoDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMP_DIR, 'repo-'));
}
