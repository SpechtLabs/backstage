import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';

export interface PublishTarget {
  /** owner/name of the repo the pull request goes to. */
  repo: string;
  /** Path of the generated file in that repo. */
  path: string;
  /** The branch Backstage owns and force-pushes. */
  branch: string;
}

export interface PublishInput {
  policyText: string;
  title: string;
  body: string;
}

export type PublishResult =
  | { outcome: 'up-to-date' }
  | { outcome: 'opened' | 'updated'; url: string };

const API = 'https://api.github.com';
// GitHub's limit on a pull request body.
const MAX_BODY = 65000;

class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Opens (or refreshes) one pull request that puts the generated policy at
 * target.path. The branch always holds a single commit on top of the base
 * branch, so the pull request shows exactly what the catalog would change.
 */
export async function publishPolicy(
  credentials: GithubCredentialsProvider,
  target: PublishTarget,
  input: PublishInput,
  logger: LoggerService,
): Promise<PublishResult> {
  const { token } = await credentials.getCredentials({
    url: `https://github.com/${target.repo}`,
  });
  if (!token) throw new Error(`No GitHub token for ${target.repo}`);

  const gh = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!response.ok) {
      throw new GitHubError(
        response.status,
        `GitHub ${init.method ?? 'GET'} ${path}: ${
          response.status
        } ${await response.text()}`,
      );
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  };
  const getFile = async (ref: string) => {
    try {
      const file = await gh<{ sha: string; content: string }>(
        `/repos/${target.repo}/contents/${target.path}?ref=${encodeURIComponent(
          ref,
        )}`,
      );
      return {
        sha: file.sha,
        text: Buffer.from(file.content, 'base64').toString('utf8'),
      };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404)
        return undefined;
      throw error;
    }
  };

  const repo = await gh<{ default_branch: string }>(`/repos/${target.repo}`);
  const base = repo.default_branch;
  const owner = target.repo.split('/')[0];
  const [open] = await gh<Array<{ number: number; html_url: string }>>(
    `/repos/${target.repo}/pulls?state=open&head=${owner}:${encodeURIComponent(
      target.branch,
    )}`,
  );

  const onBase = await getFile(base);
  if (onBase?.text === input.policyText) {
    if (open) {
      await gh(`/repos/${target.repo}/pulls/${open.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      });
      logger.info(`Closed ${open.html_url}: ${base} already has the policy`);
    }
    return { outcome: 'up-to-date' };
  }

  const onBranch = await getFile(target.branch);
  if (onBranch?.text !== input.policyText) {
    const head = await gh<{ object: { sha: string } }>(
      `/repos/${target.repo}/git/ref/heads/${encodeURIComponent(base)}`,
    );
    try {
      await gh(
        `/repos/${target.repo}/git/refs/heads/${encodeURIComponent(
          target.branch,
        )}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ sha: head.object.sha, force: true }),
        },
      );
    } catch (error) {
      if (!(error instanceof GitHubError) || error.status !== 422) throw error;
      await gh(`/repos/${target.repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${target.branch}`,
          sha: head.object.sha,
        }),
      });
    }
    await gh(`/repos/${target.repo}/contents/${target.path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `${input.title}\n\nRendered by Backstage's tailnet-policy plugin from the software catalog.`,
        content: Buffer.from(input.policyText).toString('base64'),
        branch: target.branch,
        ...(onBase ? { sha: onBase.sha } : {}),
      }),
    });
  }

  const body =
    input.body.length > MAX_BODY
      ? `${input.body.slice(0, MAX_BODY)}\n\n…(truncated)`
      : input.body;
  if (open) {
    await gh(`/repos/${target.repo}/pulls/${open.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: input.title, body }),
    });
    return { outcome: 'updated', url: open.html_url };
  }
  const created = await gh<{ html_url: string }>(
    `/repos/${target.repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        head: target.branch,
        base,
        body,
      }),
    },
  );
  return { outcome: 'opened', url: created.html_url };
}
