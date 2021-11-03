import type { CommandModule, InferredOptionTypes } from 'yargs';

import { yargsOptions } from './yargsOptions';

import { sync } from './index';

export const initCommand: CommandModule<unknown, InferredOptionTypes<typeof yargsOptions>> = {
  command: 'init',
  describe: 'Initialize a destination git repository',
  async handler(argv) {
    await sync(argv, true);
  },
};
