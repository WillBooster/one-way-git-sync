# one-way-git-sync

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A tool for synchronizing a destination git repository with a source git repository safely.
It provides two features: 1) replace the contents of a destination repository with the contents of a source repository
and 2) add a replacement commit which whose message has the history of the included commits in the source repository.
We call the replacement commit `sync commit`.

## How to Use

### Initial Usage

You need to force synchronizing the destination repository with the source repository.
`one-way-git-sync` usually stops when the latest commit of the destination repository is not a sync commit.
There should be no sync commit in the first time when you use `one-way-git-sync`.
So you need to use `--force` option to force synchronizing the destination repository.
The sample command is as follows:

```
yarn one-way-git-sync --force \
  -d https://github.com/WillBooster/sample-of-one-way-git-sync \
  -p https://github.com/WillBooster/one-way-git-sync/commits/
```

### Usual Usage

If the last commit in the destination repository is a sync commit,
`one-way-git-sync` safely synchronize the destination repository with the source repository.
The sample command is as follows:

```
yarn one-way-git-sync \
  -d https://github.com/WillBooster/sample-of-one-way-git-sync \
  -p https://github.com/WillBooster/one-way-git-sync/commits/
```

### How to Deal with Conflicts

If the last commit in the destination repository isn't a sync commit and if it is not first time,
the destination repository probably has a commit which doesn't exist in the source repository.
You basically need to merge such commits in the source repository at first,
then, you need to force synchronizing the destination repository with the source repository.
The sample commands are as follows:

1. `cd one-way-git-sync`
2. `git remote add upstream https://github.com/WillBooster/sample-of-one-way-git-sync`
3. `git merge --allow-unrelated-histories upstream/main`
4. ```
   yarn one-way-git-sync --force \
     -d https://github.com/WillBooster/sample-of-one-way-git-sync \
     -p https://github.com/WillBooster/one-way-git-sync/commits/
   ```

## Example Repository

[sample-of-one-way-git-sync](https://github.com/WillBooster/sample-of-one-way-git-sync) is an example synchronized repository.
[release.yml](.github/workflows/release.yml) releases a new npm package and add a tag automatically in this repository using `semantic-release`.
When a new version is released, [sync.yml](.github/workflows/sync.yml) synchronizes `sample-of-one-way-git-sync` repository using `one-way-git-sync`.
We can manually trigger [force-sync.yml](.github/workflows/force-sync.yml) which forces synchronizing `sample-of-one-way-git-sync` repository.
