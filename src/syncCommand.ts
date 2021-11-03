import type { CommandModule, InferredOptionTypes } from 'yargs';

import { yargsOptions } from './yargsOptions';

import { sync } from './index';

export const syncCommand: CommandModule<unknown, InferredOptionTypes<typeof yargsOptions>> = {
  command: 'sync',
  describe: 'Synchronize a destination git repository with a source git repository',
  async handler(argv) {
    await sync(argv, false);
  },
};
