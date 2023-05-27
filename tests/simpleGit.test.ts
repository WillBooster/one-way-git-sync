import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { simpleGit } from 'simple-git';
import { beforeEach, expect, test, afterEach } from 'vitest';

import { LOCAL_SRC, REMOTE_SRC, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
});

test('can execute git init, commit and log', async () => {
  process.chdir(TEMP_DIR);

  const git = simpleGit();
  await git.init();
  const isGitRepo = await git.checkIsRepo();
  expect(isGitRepo).toBe(true);

  await fs.writeFile(path.join(TEMP_DIR, 'file.txt'), 'Hello World!');
  await git.add('.');
  await git.commit('Initial commit');

  const log = await git.log();
  expect(log.latest?.message).toBe('Initial commit');
});

test('can execute git clone', async () => {
  await fs.mkdir(path.join(TEMP_DIR, REMOTE_SRC), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_SRC), { recursive: true });

  process.chdir(path.join(TEMP_DIR, REMOTE_SRC));
  const remoteGit = simpleGit();
  await remoteGit.init(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localGit = simpleGit();
  await localGit.clone(path.join(TEMP_DIR, REMOTE_SRC));

  const isGitRepo = await localGit.checkIsRepo();
  expect(isGitRepo).toBe(true);
});

test('can execute git push', async () => {
  await fs.mkdir(path.join(TEMP_DIR, REMOTE_SRC), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_SRC), { recursive: true });

  process.chdir(path.join(TEMP_DIR, REMOTE_SRC));
  const remoteGit = simpleGit();
  await remoteGit.init(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localGit = simpleGit();
  await localGit.init();
  await localGit.remote(['add', 'origin', path.join(TEMP_DIR, REMOTE_SRC)]);

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'file.txt'), 'Hello World!');
  await localGit.add('.');
  await localGit.commit('Initial commit');
  await localGit.push(['-u', 'origin', 'main']);

  process.chdir(path.join(TEMP_DIR, REMOTE_SRC));
  const log = await remoteGit.log();
  expect(log.latest?.message).toBe('Initial commit');
});
