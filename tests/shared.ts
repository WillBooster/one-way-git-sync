import fs from 'node:fs/promises';
import path from 'node:path';

import type { SimpleGit } from 'simple-git';

import { TEMP_DIR } from './constants.js';

export function createRepoDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMP_DIR, 'repo-'));
}

export async function setUpRepo(remoteDestGit: SimpleGit): Promise<void> {
  await remoteDestGit.addConfig('user.email', 'bot@willbooster.com');
  await remoteDestGit.addConfig('user.name', 'WillBooster Bot');
}
