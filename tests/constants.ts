import path from 'node:path';
import url from 'node:url';

export const REMOTE_SRC = 'remote-src';

export const REMOTE_DEST = 'remote-dest';

export const LOCAL_SRC = 'local-src';

export const LOCAL_DEST = 'local-dest';

export const TEMP_DIR = path.join(path.dirname(path.dirname(url.fileURLToPath(import.meta.url))), 'temp/');
