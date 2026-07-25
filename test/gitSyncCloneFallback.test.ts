import fs from 'node:fs/promises';
import path from 'node:path';

import type * as SimpleGitModule from 'simple-git';
import { simpleGit } from 'simple-git';
import { beforeEach, expect, test, vi } from 'vitest';

import { DEFAULT_OPTIONS, LOCAL_DEST_DIR, LOCAL_SRC_DIR, REMOTE_DEST_DIR, TEMP_DIR } from './constants.js';
import { createRepoDir, setUpGit } from './shared.js';

// The clone fallback is only reachable when the first clone throws, which a local-path clone never
// does on its own, so the first call is failed deliberately. Without that injection the branch
// handling in the fallback cannot be exercised at all.
vi.mock('simple-git', async () => {
  const actual = await vi.importActual<typeof SimpleGitModule>('simple-git');
  return {
    ...actual,
    simpleGit: (...args: Parameters<typeof actual.simpleGit>) => {
      const git = actual.simpleGit(...args);
      const clone = git.clone.bind(git);
      git.clone = ((...cloneArgs: Parameters<typeof clone>) => {
        if (failNextClone) {
          failNextClone = false;
          return Promise.reject(new Error('simulated transient clone failure'));
        }
        return clone(...cloneArgs);
      }) as typeof git.clone;
      return git;
    },
  };
});

let failNextClone = false;

beforeEach(async () => {
  failNextClone = false;
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
  await fs.mkdir(LOCAL_SRC_DIR, { recursive: true });
  await fs.mkdir(LOCAL_DEST_DIR, { recursive: true });
  await fs.mkdir(REMOTE_DEST_DIR, { recursive: true });

  await setUpGit();

  await simpleGit(REMOTE_DEST_DIR).init(true, ['--initial-branch=main']);

  // The destination's sync commit has to name a commit that really exists in the source, otherwise
  // syncCore fails while reading the source history and never reaches the branch handling.
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);
  await localSrcGit.init(false, ['--initial-branch=main']);
  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');
  const srcLog = await localSrcGit.log();
  const syncedHash = srcLog.latest?.hash;

  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.init(false, ['--initial-branch=main']);
  await localDestGit.remote(['add', 'origin', REMOTE_DEST_DIR]);
  await fs.writeFile(path.join(LOCAL_DEST_DIR, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit(`sync https://github.com/WillBooster/one-way-git-sync/commits/${syncedHash}`);
  await localDestGit.push(['-u', 'origin', 'main']);

  // Something for this run to actually synchronize.
  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'added.txt'), 'Added');
  await localSrcGit.add('.');
  await localSrcGit.commit('Add a file to synchronize');
});

test('a clone failure without --branch never pushes to a branch named "undefined"', async () => {
  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: undefined }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).not.toContain('undefined');
  expect(branches.all).toContain('main');
});

test('a clone failure with --branch creates and pushes that branch', async () => {
  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'released' }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).toContain('released');
  expect(branches.all).not.toContain('undefined');
});
