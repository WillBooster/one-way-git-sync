import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { initCommand } from './initCommand';
import { logger } from './logger';
import { syncCommand } from './syncCommand';
import { yargsOptions } from './yargsOptions';

export async function cli(argv: string[]): Promise<void> {
  await yargs(hideBin(argv))
    .options(yargsOptions)
    .middleware((argv) => {
      logger.level = argv.verbose ? 'verbose' : 'info';
    })
    .command(initCommand)
    .command(syncCommand).argv;
}
