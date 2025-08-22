import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';

import { TEMP_DIR } from './constants.js';

export function createRepoDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMP_DIR, 'repo-'));
}

export async function setUpGit(): Promise<void> {
  const git = simpleGit();
  const emailConfig = await git.getConfig('user.email', 'global');
  if (emailConfig.value) return;

  await git.addConfig('user.email', 'bot@willbooster.com', false, 'global');
  await git.addConfig('user.name', 'WillBooster Bot', false, 'global');
}
