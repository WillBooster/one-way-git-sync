import path from 'node:path';
import url from 'node:url';

import { Options } from '../src/sync.js';

export const REMOTE_SRC = 'remote-src';

export const REMOTE_DEST = 'remote-dest';

export const LOCAL_SRC = 'local-src';

export const LOCAL_DEST = 'local-dest';

export const TEMP_DIR = path.join(path.dirname(path.dirname(url.fileURLToPath(import.meta.url))), 'temp');

export const DEFAULT_OPTIONS: Options = {
  dest: path.join(TEMP_DIR, REMOTE_DEST),
  'ignore-patterns': ['.git', '.github', 'node_modules', '.renovaterc.*'],
  prefix: undefined,
  branch: undefined,
  tag: undefined,
  'tag-hash': undefined,
  'tag-version': undefined,
  dry: undefined,
  force: undefined,
  verbose: undefined,
} as const;
