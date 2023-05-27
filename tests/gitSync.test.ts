import fs from 'node:fs/promises';
import path from 'node:path';

import { SimpleGit, simpleGit } from 'simple-git';
import { expect, test, beforeEach, afterEach } from 'vitest';

import { syncCore } from '../src/sync.js';

import { DEFAULT_OPTIONS, LOCAL_DEST, LOCAL_SRC, REMOTE_DEST, TEMP_DIR } from './constants.js';

beforeEach(async () => {
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_SRC), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, LOCAL_DEST), { recursive: true });
  await fs.mkdir(path.join(TEMP_DIR, REMOTE_DEST), { recursive: true });

  process.chdir(path.join(TEMP_DIR, REMOTE_DEST));
  const remoteDestGit = simpleGit();
  await remoteDestGit.init(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();
  await localDestGit.init();
  await localDestGit.remote(['add', 'origin', path.join(TEMP_DIR, REMOTE_DEST)]);

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit('Initial commit');
  await localDestGit.push(['-u', 'origin', 'main']);

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();
  await localSrcGit.init();

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');
});

afterEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
});

test('can initialize git sync', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(
    `Replace all the files with those of ${DEFAULT_OPTIONS.dest} due to missing sync commit.\n`
  );

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync without additional commits', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  ret = await syncCore(await createRepoDir(), DEFAULT_OPTIONS);
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(
    `Replace all the files with those of ${DEFAULT_OPTIONS.dest} due to missing sync commit.\n`
  );

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync without options', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const syncSrc2FilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src2.txt');
  expect(fs.lstat(syncSrc2FilePath)).resolves.not.toThrow();
  const syncSrc2FileContent = await fs.readFile(syncSrc2FilePath, 'utf8');
  expect(syncSrc2FileContent).toBe('Src Repository 2');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* add src2.txt', '', '* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test.each<{ label: string; prefix: string; expectedSyncCommitMessage: (syncCommitHash: string) => string }>([
  {
    label: "ends with '/'",
    prefix: 'git-sync/',
    expectedSyncCommitMessage: (syncCommitHash: string) => `sync git-sync/${syncCommitHash}`,
  },
  {
    label: "ends without '/'",
    prefix: 'git-sync',
    expectedSyncCommitMessage: (syncCommitHash: string) => `sync git-sync/${syncCommitHash}`,
  },
])('can git sync with prefix option ($label)', async ({ expectedSyncCommitMessage, prefix }) => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, prefix });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(expectedSyncCommitMessage(srcLog.latest?.hash as string));
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test.each<{ label: string; createBranch: (git: SimpleGit, branchName: string) => Promise<void> }>([
  {
    label: 'new branch',
    createBranch: async () => {
      // do nonthing
    },
  },
  {
    label: 'existing branch',
    createBranch: async (git, branchName) => {
      await git.checkout(['-b', branchName]);
      await git.push(['-u', 'origin', branchName]);
      await git.checkout(['main']);
    },
  },
])('can git sync with branch option ($label)', async ({ createBranch }) => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await localDestGit.pull();
  await createBranch(localDestGit, 'git-sync');

  let srcLog = await localSrcGit.log();

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'git-sync' });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  let destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  let syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  let destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);

  await localDestGit.checkout(['git-sync']);
  await localDestGit.pull();

  destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).rejects.toThrow();

  srcLog = await localSrcGit.log();
  destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync with tag option', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, tag: 'v0.1.0' });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBe('v0.1.0');
});

test('can git sync with tag-hash option', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');
  await localSrcGit.addAnnotatedTag('v0.1.0', 'v0.1.0');
  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'tag-hash': true });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src2.txt');
  expect(fs.lstat(syncSrc2FilePath)).resolves.not.toThrow();
  const syncSrc2FileContent = await fs.readFile(syncSrc2FilePath, 'utf8');
  expect(syncSrc2FileContent).toBe('Src Repository 2');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  const hashShortCommitHash = srcLog.latest?.hash?.slice?.(0, 7);
  expect(destLog.latest?.message).toBe(`sync v0.1.0-1-g${hashShortCommitHash} (${srcLog.latest?.hash})`);
  expect(destLog.latest?.body).toBe(['* add src2.txt', '', '* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBe(`v0.1.0-1-g${hashShortCommitHash}`);
});

test.each<{ label: string; tagHash: boolean }>([
  { label: 'pure', tagHash: false },
  { label: 'with tag-hash', tagHash: true },
])('can git sync with tag-version option ($label)', async ({ tagHash }) => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');
  await localSrcGit.addAnnotatedTag('v0.1.0', 'v0.1.0');
  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'tag-version': true, 'tag-hash': tagHash });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src2.txt');
  expect(fs.lstat(syncSrc2FilePath)).resolves.not.toThrow();
  const syncSrc2FileContent = await fs.readFile(syncSrc2FilePath, 'utf8');
  expect(syncSrc2FileContent).toBe('Src Repository 2');

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync v0.1.0 (${srcLog.latest?.hash})`);
  expect(destLog.latest?.body).toBe(['* add src2.txt', '', '* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBe('v0.1.0');
});

test.skip.each<{ label: string; tagHash: boolean; tagVersion: boolean }>([
  { label: 'tag-tash', tagHash: true, tagVersion: false },
  { label: 'tag-version', tagHash: false, tagVersion: true },
])('can git sync with tag-* option when no tag exists ($label)', async ({ tagHash, tagVersion }) => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'tag-hash': tagHash, 'tag-version': tagVersion });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test.skip('can git sync with ignore-patterns option', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'ignore-patterns': 'src2.txt' });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src2.txt');
  expect(fs.lstat(syncSrc2FilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* add src2.txt', '', '* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync with dry option', async () => {
  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  const localDestGit = simpleGit();

  process.chdir(path.join(TEMP_DIR, LOCAL_SRC));
  const localSrcGit = simpleGit();

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true });
  expect(ret).toBe(true);

  const srcLog = await localSrcGit.log();

  await fs.rm(path.join(TEMP_DIR, LOCAL_SRC, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(TEMP_DIR, LOCAL_SRC, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, dry: true });
  expect(ret).toBe(true);

  process.chdir(path.join(TEMP_DIR, LOCAL_DEST));
  await localDestGit.pull();

  const destFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  const src2FilePath = path.join(TEMP_DIR, LOCAL_DEST, 'src2.txt');
  expect(fs.lstat(src2FilePath)).rejects.toThrow();

  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

function createRepoDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMP_DIR, 'repo-'));
}
