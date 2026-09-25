export function normalizeInstanceUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Instance URL is required');
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a valid Gitea instance URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS instance URL without credentials, query, or fragment');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid instance URL path');
  }
  url.pathname = segments.length ? `/${segments.join('/')}` : '';
  return url.href.replace(/\/$/, '');
}

export function giteaApiUrl(instanceUrl, path) {
  if (!path.startsWith('/')) throw new Error('Gitea API path must start with /');
  return `${instanceUrl}/api/v1${path}`;
}
