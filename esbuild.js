const { builtinModules } = require('module');
const path = require('path');

const { build } = require('esbuild');

const package = require(path.resolve('package.json'));

// If you want to bundle external libraries, please add them in devDependencies
const external = [...builtinModules, ...Object.keys(package.dependencies ?? {})];

Promise.all([
  build({
    bundle: true,
    entryPoints: ['src/cli.ts'],
    external,
    minify: true,
    outfile: 'dist/cli.min.cjs',
    platform: 'node',
    sourcemap: true,
    target: 'node14',
  }),
]).then();
