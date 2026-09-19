export const openCodeProxyPath = (url: Pick<URL, 'pathname' | 'search'>): string => {
  const pathname = /^\/api\/plugins(?:\/|$)/.test(url.pathname)
    ? url.pathname
    : url.pathname.replace(/^\/api/, '');
  return `${pathname}${url.search}`;
};
