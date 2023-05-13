import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { logger } from './logger.js';
import { sync } from './sync.js';
import { yargsOptions } from './yargsOptions.js';

const argv = await yargs(hideBin(process.argv))
  .scriptName('one-way-git-sync')
  .options(yargsOptions)
  .middleware((argv) => {
    logger.level = argv.verbose ? 'verbose' : 'info';
  })
  .strict()
  .help().argv;
await sync(argv);
