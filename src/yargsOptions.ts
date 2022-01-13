export const yargsOptions = {
  dest: {
    type: 'string',
    alias: 'd',
    describe: 'A URL of a destination git repository.',
    demand: true,
  },
  prefix: {
    type: 'string',
    alias: 'p',
    describe: `A prefix of a commit hash used to generate a commit title, e.g. 'sync <prefix>/<hash>'.
               A typical value is like 'https://github.com/WillBooster/one-way-git-sync/commits'`,
  },
  branch: {
    type: 'string',
    alias: 'b',
    describe: 'Specify branch of destination repo.',
  },
  tag: {
    type: 'string',
    alias: 't',
    describe: 'Specify tag to be created in destination repo.',
  },
  'tag-hash': {
    type: 'boolean',
    describe: 'Create version+hash tag (e.g. v1.31.5-2-gcdde507). It should be a unique tag.',
  },
  'tag-version': {
    type: 'boolean',
    describe: 'Create version tag (e.g. v1.31.5). It could be a non-unique tag.',
  },
  'ignore-patterns': {
    type: 'string',
    alias: 'i',
    describe: `Exclude the files whose path matches one of the given patterns.
               The patterns are processed by micromatch (https://github.com/micromatch/micromatch).
               You may specify the option multiple times. Default value is ['.git', 'node_modules']`,
  },
  dry: {
    type: 'boolean',
    describe: 'Enable dry-run mode.',
  },
  force: {
    type: 'boolean',
    describe: 'Force to overwrite the destination git repository.',
  },
  verbose: {
    type: 'boolean',
    alias: 'v',
    describe: 'Show details logs.',
  },
} as const;
