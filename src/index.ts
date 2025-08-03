import fs from 'node:fs';
import path from 'node:path';

import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { logger } from './logger.js';
import { sync } from './sync.js';
import { yargsOptions } from './yargsOptions.js';

const argv = await yargs(hideBin(process.argv))
  .scriptName('one-way-git-sync')
  .options(yargsOptions)
  .middleware((argv) => {
    logger.level = argv.verbose ? 'trace' : 'info';
  })
  .strict()
  .version(getVersion())
  .help().argv;

function getVersion(): string {
  let packageJsonDir = path.dirname(new URL(import.meta.url).pathname);
  while (!fs.existsSync(path.join(packageJsonDir, 'package.json'))) {
    packageJsonDir = path.dirname(packageJsonDir);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageJsonDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  return packageJson.version;
}

await sync(argv);
