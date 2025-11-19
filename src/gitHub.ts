import type { SimpleGit } from 'simple-git';

export async function getGitHubCommitsUrl(git: SimpleGit): Promise<string | undefined> {
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === 'origin');
  if (!origin) {
    return;
  }
  let remoteUrl: string | undefined = origin.refs.fetch;
  if (!remoteUrl) {
    remoteUrl = origin.refs.push;
  }
  if (typeof remoteUrl === 'string' && remoteUrl.includes('github.com')) {
    const words = remoteUrl.split('/');
    const org = words.at(-2);
    const name = words.at(-1)?.replace(/.git$/, '');
    if (org && name) return `https://github.com/${org}/${name}/commits`;
  }
}
