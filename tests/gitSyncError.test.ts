import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { beforeEach, expect, test } from 'vitest';

import { syncCore } from '../src/sync.js';

import { DEFAULT_OPTIONS, LOCAL_DEST_DIR, LOCAL_SRC_DIR, REMOTE_DEST_DIR, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
  await fs.mkdir(LOCAL_SRC_DIR, { recursive: true });
  await fs.mkdir(LOCAL_DEST_DIR, { recursive: true });
  await fs.mkdir(REMOTE_DEST_DIR, { recursive: true });

  const remoteDestGit = simpleGit(REMOTE_DEST_DIR);
  await remoteDestGit.init(true, ['--initial-branch=main']);

  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.init(false, ['--initial-branch=main']);
  await localDestGit.remote(['add', 'origin', REMOTE_DEST_DIR]);

  const localSrcGit = simpleGit(LOCAL_SRC_DIR);
  await localSrcGit.init(false, ['--initial-branch=main']);
});

test.skip.each<{ label: string; force: boolean }>([
  { label: 'normal', force: false },
  { label: 'force', force: true },
])('can report error when no commit exists ($label)', async ({ force }) => {
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force });
  expect(ret).toBe(false);
});

test('can report error when no sync commit exists', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);

  await fs.writeFile(path.join(LOCAL_DEST_DIR, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit('Initial commit');
  await localDestGit.push(['-u', 'origin', 'main']);

  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');

  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS });
  expect(ret).toBe(false);
});

function createRepoDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMP_DIR, 'repo-'));
}
