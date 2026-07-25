import { expect, test } from 'vitest';

import { redactUrlCredentials } from '../src/sync.js';

// The README recommends passing the destination as `https://oauth2:<PAT>@github.com/...`, and git
// echoes that URL back in its error text, so anything logged from a clone failure can carry a token.
// The WHOLE userinfo goes, username included: GitHub also accepts a bare token as the username
// (`https://ghp_...@github.com/...`), so keeping that half would leak exactly the same secret.
test.each<{ label: string; input: string; expected: string }>([
  {
    label: 'a PAT in the destination URL',
    input: "fatal: could not read from 'https://oauth2:ghp_secretTokenValue@github.com/owner/repo.git'",
    expected: "fatal: could not read from 'https://***@github.com/owner/repo.git'",
  },
  {
    label: 'user:password credentials',
    input: 'remote: https://alice:s3cr3t@example.com/repo.git rejected',
    expected: 'remote: https://***@example.com/repo.git rejected',
  },
  {
    label: 'a bare token as the username',
    input: 'fatal: unable to access https://ghp_secretTokenValue@github.com/owner/repo.git/',
    expected: 'fatal: unable to access https://***@github.com/owner/repo.git/',
  },
  {
    label: 'two URLs in one message',
    input: 'https://a:1@x.com/r.git and https://b:2@y.com/r.git',
    expected: 'https://***@x.com/r.git and https://***@y.com/r.git',
  },
])('redacts $label', ({ input, expected }) => {
  expect(redactUrlCredentials(input)).toBe(expected);
});

test.each<{ label: string; input: string }>([
  { label: 'a URL without credentials', input: 'fatal: repository https://github.com/owner/repo.git not found' },
  // scp-like SSH remotes carry no secret, and the `@` sits after no `://`, so nothing should change.
  { label: 'an scp-like SSH remote', input: 'fatal: could not read from git@github.com:owner/repo.git' },
  { label: 'an email address in prose', input: 'committer bot@willbooster.com is not allowed' },
  { label: 'a message with no URL at all', input: 'simulated transient clone failure' },
])('leaves $label untouched', ({ input }) => {
  expect(redactUrlCredentials(input)).toBe(input);
});
