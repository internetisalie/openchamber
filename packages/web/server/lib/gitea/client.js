import { giteaApiUrl } from './instance.js';

export class GiteaRequestError extends Error {
  constructor(status) {
    const message = status === 401 ? 'Gitea token is invalid or expired. Reconnect in Integrations.'
      : status === 403 ? 'The Gitea token lacks permission or this account cannot access the repository.'
      : status === 404 ? 'The Gitea repository or item was not found or is inaccessible.'
      : status === 409 ? 'Gitea reports a pull request conflict.'
      : status === 422 ? 'Gitea rejected the pull request. Check that both branches exist and no pull request already uses them.'
      : `Gitea request failed (${status})`;
    super(message);
    this.status = status;
  }
}

async function requestGiteaResponse({ instanceUrl, token }, apiPath, accept, options = {}) {
  const headers = { Authorization: `token ${token}`, Accept: accept };
  const request = {
    method: options.method ?? 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(giteaApiUrl(instanceUrl, apiPath), request);
  if (!response.ok) throw new GiteaRequestError(response.status);
  const limit = 4_000_000;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Gitea response is too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Gitea returned an empty response');
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('Gitea response is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  if (accept === 'text/plain') return { data: body, response };
  try {
    return { data: JSON.parse(body), response };
  } catch {
    throw new Error('Gitea returned an invalid response');
  }
}

export async function requestGitea(connection, apiPath, { accept = 'application/json', ...options } = {}) {
  const { data } = await requestGiteaResponse(connection, apiPath, accept, options);
  return data;
}

export async function requestGiteaPage(connection, apiPath) {
  const { data, response } = await requestGiteaResponse(connection, apiPath, 'application/json');
  const link = response.headers.get('link');
  const hasNext = link === null ? null : link.split(',').some((part) =>
    /(?:^|;)\s*rel\s*=\s*"?next"?\s*(?:;|$)/i.test(part));
  return { data, hasNext };
}

export async function verifyConnection(instanceUrl, token) {
  const user = await requestGitea({ instanceUrl, token }, '/user');
  if (typeof user?.login !== 'string' || !user.login) throw new Error('Gitea returned an invalid account');
  return { instanceUrl, token, user: { login: user.login } };
}
