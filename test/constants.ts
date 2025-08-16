import os from 'node:os';
import path from 'node:path';

import type { YargsOptions } from '../src/sync.js';

export const TEMP_DIR = path.join(os.tmpdir(), 'one-way-git-sync');
export const REMOTE_SRC_DIR = path.join(TEMP_DIR, 'remote-src');
export const REMOTE_DEST_DIR = path.join(TEMP_DIR, 'remote-dest');
export const LOCAL_SRC_DIR = path.join(TEMP_DIR, 'local-src');
export const LOCAL_DEST_DIR = path.join(TEMP_DIR, 'local-dest');

export const DEFAULT_OPTIONS: YargsOptions = {
  dest: REMOTE_DEST_DIR,
  'ignore-patterns': ['.git', '.github', 'node_modules', '.renovaterc.*'],
  prefix: undefined,
  branch: undefined,
  tag: undefined,
  'tag-hash': undefined,
  'tag-version': undefined,
  dry: undefined,
  force: undefined,
  verbose: true,
} as const;
