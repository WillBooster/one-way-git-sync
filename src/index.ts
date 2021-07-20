import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

export async function cli(argv: string[]): Promise<void> {
  const { dry } = await yargs(hideBin(argv)).options({
    dry: {
      type: 'boolean',
      alias: 'd',
      describe: 'Enable dry-run mode',
    },
  }).argv;
  console.info(dry);
}
