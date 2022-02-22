# one-way-git-sync

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

:arrows_counterclockwise: A tool for synchronizing a destination git repository with a source git repository SAFELY.

It provides three features:

1. replace the files of a destination repository (`dest repo`) with those of a source repository (`src repo`),
2. add a replacement commit (`sync commit`) which whose message has the history of the included commits in the src repo and
3. detect a conflict when a dest repo has a commit which a src repo doesn't have.

## How to Use

### Initial Usage

Because `one-way-git-sync` finds a sync commit from the commit history of the dest repo,
you need to run `init` subcommand to add an initial sync commit to the dest repo
by replacing all the files of the dest repo with those of src repo at first.
The sample command is as follows:

```
yarn one-way-git-sync init \
  -d https://github.com/WillBooster/sample-of-one-way-git-sync \
  -p https://github.com/WillBooster/one-way-git-sync/commits/
```

If you have no permission to modify `https://github.com/WillBooster/sample-of-one-way-git-sync`,
you have to

### Usual Usage

If the last commit in the dest repo is a sync commit,
`one-way-git-sync` safely synchronizes the dest repo with the src repo.
The sample command is as follows:

```
yarn one-way-git-sync \
  -d https://github.com/WillBooster/sample-of-one-way-git-sync \
  -p https://github.com/WillBooster/one-way-git-sync/commits/
```

### How to Deal with Conflicts

If the last commit in the dest repo isn't a sync commit and if it is not first time,
the dest repo probably has some commits (`conflict commits`) which don't exist in the src repo.
You need to merge conflict commits in the src repo manually at first,
then, you need to force synchronizing the dest repo with the src repo.
The sample commands are as follows:

1. `yarn one-way-git-sync` fails then you notice there exist conflict commits
2. `cd one-way-git-sync`
3. `git remote add upstream https://github.com/WillBooster/sample-of-one-way-git-sync`
4. `git merge --allow-unrelated-histories upstream/main`
5. ```
   yarn one-way-git-sync --force \
     -d https://github.com/WillBooster/sample-of-one-way-git-sync \
     -p https://github.com/WillBooster/one-way-git-sync/commits/
   ```

## Example Repository and Example GitHub Actions Workflows

- [sample-of-one-way-git-sync](https://github.com/WillBooster/sample-of-one-way-git-sync): an example synchronized repository.
- [release.yml](.github/workflows/release.yml): releases a new npm package and add a tag automatically in this repository using `semantic-release`.
- [sync.yml](.github/workflows/sync.yml): it synchronizes `sample-of-one-way-git-sync` repository using `one-way-git-sync` when a new version is released.
- [force-sync.yml](.github/workflows/sync-force.yml): we can manually trigger this workflow which forces synchronizing `sample-of-one-way-git-sync` repository.
