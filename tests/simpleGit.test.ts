import fs from 'node:fs/promises';
import path from 'node:path';

import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';
import { beforeEach, expect, test } from 'vitest';

import { LOCAL_SRC_DIR, REMOTE_SRC_DIR, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });
});

test('can execute git init, commit and log', async () => {
  const git = simpleGit(TEMP_DIR);
  await git.init();
  const isGitRepo = await git.checkIsRepo();
  expect(isGitRepo).toBe(true);

  await fs.writeFile(path.join('file.txt'), 'Hello World!');
  await git.add('.');
  await git.commit('Initial commit');

  const log = await git.log();
  expect(log.latest?.message).toBe('Initial commit');
});

test('can execute git clone', async () => {
  const [localGit] = await setupLocalAndRemoteRepos();

  const isGitRepo = await localGit.checkIsRepo();
  expect(isGitRepo).toBe(true);
});

test.only('can execute git push', async () => {
  const [localGit, remoteGit] = await setupLocalAndRemoteRepos();

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'file.txt'), 'Hello World!');
  await localGit.add('.');
  await localGit.commit('Initial commit');
  await localGit.push('origin', 'main');

  const log = await remoteGit.log();
  expect(log.latest?.message).toBe('Initial commit');
});

export async function setupLocalAndRemoteRepos(): Promise<[SimpleGit, SimpleGit]> {
  await fs.mkdir(REMOTE_SRC_DIR, { recursive: true });
  await fs.mkdir(LOCAL_SRC_DIR, { recursive: true });

  const remoteGit = simpleGit(REMOTE_SRC_DIR);
  await remoteGit.init(true, ['--initial-branch=main']);

  const localGit = simpleGit(LOCAL_SRC_DIR);
  await localGit.clone(REMOTE_SRC_DIR, LOCAL_SRC_DIR);

  return [localGit, remoteGit];
}
