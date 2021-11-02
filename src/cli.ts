import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { yargsOptions } from './yargsOptions';

import { main } from './index';

export async function cli(argv: string[]): Promise<void> {
  const parsed = await yargs(hideBin(argv)).options(yargsOptions).argv;
  await main(parsed);
}
