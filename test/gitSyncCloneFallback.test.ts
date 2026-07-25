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
let syncCommitMessage = '';

beforeEach(async () => {
  // vitest.config.ts sets `isolate: false`, and sibling test files import src/sync.ts
  // statically. Without this reset the dynamic import below can resolve to an already-evaluated
  // copy bound to the REAL simple-git, so the injected failure never fires and these tests pass
  // while asserting nothing. Each test also asserts the injection fired, so it cannot degrade
  // back into a silent no-op.
  vi.resetModules();
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
  syncCommitMessage = `sync https://github.com/WillBooster/one-way-git-sync/commits/${syncedHash}`;
  await localDestGit.commit(syncCommitMessage);
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
  expect(failNextClone).toBe(false);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).not.toContain('undefined');
  expect(branches.all).toContain('main');
});

test('a clone failure with --branch creates and pushes that branch', async () => {
  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'released' }, LOCAL_SRC_DIR);
  expect(failNextClone).toBe(false);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).toContain('released');
  expect(branches.all).not.toContain('undefined');
});

test('a clone failure with --branch naming an existing non-default branch fails instead of rewriting it', async () => {
  // Give the destination a second branch that is NOT its default, which is the shape that made the
  // old `-B` repoint it at the default branch's tip and sync from the wrong history.
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.checkoutLocalBranch('released');
  await localDestGit.push(['-u', 'origin', 'released']);
  await localDestGit.checkout('main');

  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'released' }, LOCAL_SRC_DIR);
  expect(failNextClone).toBe(false);
  // A transient failure must surface, not be turned into a sync onto the wrong history.
  expect(ret).toBe(false);

  const releasedLog = await simpleGit(REMOTE_DEST_DIR).log(['released']);
  expect(releasedLog.latest?.message).toBe(syncCommitMessage);
});

test('a branch whose name is the tail of another branch is still treated as absent', async () => {
  // `ls-remote --heads origin released` also matches refs/heads/feature/released, so a bare
  // pattern would report the requested branch as existing and refuse to create it.
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.checkoutLocalBranch('feature/released');
  await localDestGit.push(['-u', 'origin', 'feature/released']);
  await localDestGit.checkout('main');

  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'released' }, LOCAL_SRC_DIR);
  expect(failNextClone).toBe(false);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).toContain('released');
});

test('a destination with no commits at all does not crash the fallback', async () => {
  // --force --branch <new> bootstrapping an empty mirror is a supported entry point, and there the
  // retry clone lands on an unborn HEAD. No mock: the first clone really fails because the branch
  // does not exist on the destination.
  const emptyRemoteDir = await fs.mkdtemp(path.join(TEMP_DIR, 'remote-empty-'));
  await simpleGit(emptyRemoteDir).init(true, ['--initial-branch=main']);

  const { syncCore } = await import('../src/sync.js');
  const ret = await syncCore(
    await createRepoDir(),
    { ...DEFAULT_OPTIONS, dest: emptyRemoteDir, branch: 'released', force: true },
    LOCAL_SRC_DIR
  );
  expect(ret).toBe(true);

  const branches = await simpleGit(emptyRemoteDir).branch();
  expect(branches.all).toContain('released');
});

test('a clone failure with --branch pointing at an existing branch still succeeds', async () => {
  failNextClone = true;

  const { syncCore } = await import('../src/sync.js');
  // The retry clone checks out the destination's default branch, so `checkout -b main` would fail
  // with "a branch named 'main' already exists". This is the shape reusable-workflows uses.
  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'main' }, LOCAL_SRC_DIR);
  expect(failNextClone).toBe(false);
  expect(ret).toBe(true);

  const branches = await simpleGit(REMOTE_DEST_DIR).branch();
  expect(branches.all).toEqual(['main']);
});
