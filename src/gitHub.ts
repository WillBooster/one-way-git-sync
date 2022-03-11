import { SimpleGit } from 'simple-git';

export async function getGitHubCommitsUrl(git: SimpleGit): Promise<string | undefined> {
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === 'origin');
  const remoteUrl = origin?.refs?.fetch ?? origin?.refs?.push;
  if (typeof remoteUrl === 'string' && remoteUrl.includes('github.com')) {
    const words = remoteUrl.split('/');
    const org = words[words.length - 2];
    const name = words[words.length - 1]?.replace(/.git$/, '');
    if (org && name) return `https://github.com/${org}/${name}/commits`;
  }
}
