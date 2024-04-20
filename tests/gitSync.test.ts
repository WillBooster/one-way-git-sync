import fs from 'node:fs/promises';
import path from 'node:path';

import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';
import { beforeEach, expect, test } from 'vitest';

import { syncCore } from '../src/sync.js';

import {
  DEFAULT_OPTIONS,
  LOCAL_DEST_DIR,
  LOCAL_SRC_DIR,
  REMOTE_DEST_DIR,
  REMOTE_SRC_DIR,
  TEMP_DIR,
} from './constants.js';
import { createRepoDir, setUpGit } from './shared.js';

beforeEach(async () => {
  await fs.rm(TEMP_DIR, { force: true, recursive: true });
  await fs.mkdir(LOCAL_SRC_DIR, { recursive: true });
  await fs.mkdir(LOCAL_DEST_DIR, { recursive: true });
  await fs.mkdir(REMOTE_SRC_DIR, { recursive: true });
  await fs.mkdir(REMOTE_DEST_DIR, { recursive: true });

  await setUpGit();

  const remoteDestGit = simpleGit(REMOTE_DEST_DIR);
  await remoteDestGit.init(true, ['--initial-branch=main']);

  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  await localDestGit.clone(REMOTE_DEST_DIR, LOCAL_DEST_DIR);

  await fs.writeFile(path.join(LOCAL_DEST_DIR, 'dest.txt'), 'Dest Repository');
  await localDestGit.add('.');
  await localDestGit.commit('Initial commit');
  await localDestGit.push(['-u', 'origin', 'main']);

  const remoteSrcGit = simpleGit(REMOTE_SRC_DIR);
  await remoteSrcGit.init(true, ['--initial-branch=main']);

  const localSrcGit = simpleGit(LOCAL_SRC_DIR);
  await localSrcGit.clone(REMOTE_SRC_DIR, LOCAL_SRC_DIR);

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src.txt'), 'Src Repository');
  await localSrcGit.add('.');
  await localSrcGit.commit('Initial commit');
  await localSrcGit.push(['-u', 'origin', 'main']);
});

test('can initialize git sync', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  const ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
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
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  ret = await syncCore(await createRepoDir(), DEFAULT_OPTIONS, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
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
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const syncSrc2FilePath = path.join(LOCAL_DEST_DIR, 'src2.txt');
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
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, prefix }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
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
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();
  await createBranch(localDestGit, 'git-sync');

  let srcLog = await localSrcGit.log();

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, branch: 'git-sync' }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  let destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  let syncSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  let destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);

  await localDestGit.checkout(['git-sync']);
  await localDestGit.pull();

  destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  syncSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).rejects.toThrow();

  srcLog = await localSrcGit.log();
  destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync with tag option', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, tag: 'v0.1.0' }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBe('v0.1.0');
});

test('can git sync with tag-hash option', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');
  await localSrcGit.addAnnotatedTag('v0.1.0', 'v0.1.0');
  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'tag-hash': true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(LOCAL_DEST_DIR, 'src2.txt');
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
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');
  await localSrcGit.addAnnotatedTag('v0.1.0', 'v0.1.0');
  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(
    await createRepoDir(),
    { ...DEFAULT_OPTIONS, 'tag-version': true, 'tag-hash': tagHash },
    LOCAL_SRC_DIR
  );
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(LOCAL_DEST_DIR, 'src2.txt');
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

test.each<{ label: string; tagHash: boolean; tagVersion: boolean }>([
  { label: 'tag-hash', tagHash: true, tagVersion: false },
  { label: 'tag-version', tagHash: false, tagVersion: true },
])('can git sync with tag-* option when no tag exists ($label)', async ({ tagHash, tagVersion }) => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  ret = await syncCore(
    await createRepoDir(),
    { ...DEFAULT_OPTIONS, 'tag-hash': tagHash, 'tag-version': tagVersion },
    LOCAL_SRC_DIR
  );
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  const hash = srcLog.latest?.hash ?? '';
  expect(destLog.latest?.message).toBe(`sync ${hash.slice(0, tagHash ? 7 : undefined)} (${hash})`);
  expect(destLog.latest?.body).toBe(['* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync with ignore-patterns option', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, 'ignore-patterns': ['src2.txt'] }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();
  const srcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(srcFilePath)).rejects.toThrow();
  const syncSrc2FilePath = path.join(LOCAL_DEST_DIR, 'src2.txt');
  expect(fs.lstat(syncSrc2FilePath)).rejects.toThrow();

  const srcLog = await localSrcGit.log();
  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  expect(destLog.latest?.body).toBe(['* add src2.txt', '', '* delete src.txt', ''].join('\n'));

  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});

test('can git sync with dry option', async () => {
  const localDestGit = simpleGit(LOCAL_DEST_DIR);
  const localSrcGit = simpleGit(LOCAL_SRC_DIR);

  let ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, force: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  const srcLog = await localSrcGit.log();

  await fs.rm(path.join(LOCAL_SRC_DIR, 'src.txt'));
  await localSrcGit.add('.');
  await localSrcGit.commit('delete src.txt');

  await fs.writeFile(path.join(LOCAL_SRC_DIR, 'src2.txt'), 'Src Repository 2');
  await localSrcGit.add('.');
  await localSrcGit.commit('add src2.txt');

  ret = await syncCore(await createRepoDir(), { ...DEFAULT_OPTIONS, dry: true }, LOCAL_SRC_DIR);
  expect(ret).toBe(true);

  await localDestGit.pull();

  const destFilePath = path.join(LOCAL_DEST_DIR, 'dest.txt');
  expect(fs.lstat(destFilePath)).rejects.toThrow();

  const syncSrcFilePath = path.join(LOCAL_DEST_DIR, 'src.txt');
  expect(fs.lstat(syncSrcFilePath)).resolves.not.toThrow();
  const syncSrcFileContent = await fs.readFile(syncSrcFilePath, 'utf8');
  expect(syncSrcFileContent).toBe('Src Repository');

  const src2FilePath = path.join(LOCAL_DEST_DIR, 'src2.txt');
  expect(fs.lstat(src2FilePath)).rejects.toThrow();

  const destLog = await localDestGit.log();
  expect(destLog.latest?.message).toBe(`sync ${srcLog.latest?.hash}`);
  const destTags = await localDestGit.tags();
  expect(destTags.latest).toBeUndefined();
});
