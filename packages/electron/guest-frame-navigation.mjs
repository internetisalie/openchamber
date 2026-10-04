// Extension frames run sandboxed with an opaque origin and a CSP that keeps
// them off the network. A frame navigating itself is the one way out that no
// CSP inside the frame can stop: `location = 'https://anywhere/?data=…'`
// carries whatever it was shown in the URL. The desktop shell sees that
// navigation before any request is made (`will-frame-navigate`) and refuses
// it. The web runtime has no such hook; there the panel visibly leaves.
//
// Only opaque-origin subframes are judged: that is every extension frame, and
// the app's own frames (browser panel, previews) keep their origin.

const LOCAL_SCHEMES = new Set(['about:', 'data:', 'blob:']);
const GUEST_PATH_PREFIX = '/api/guests/';

/**
 * @param {{ isMainFrame: boolean, frameOrigin: string | undefined, url: string, isAppOrigin: (url: string) => boolean, apiBaseUrl?: string }} input
 * @returns {boolean} true when the navigation must be refused
 */
export const shouldBlockGuestFrameNavigation = ({ isMainFrame, frameOrigin, url, isAppOrigin, apiBaseUrl }) => {
  if (isMainFrame || frameOrigin !== 'null') return false;
  let target;
  try {
    target = new URL(url);
  } catch {
    return true;
  }
  // No network request: the document is built from what the frame already has.
  if (LOCAL_SCHEMES.has(target.protocol)) return false;
  // Another page of an extension on this app's server, which the same CSP governs.
  if (isAppOrigin(url) && target.pathname.startsWith(GUEST_PATH_PREFIX)) return false;
  // Bundled UI can use an external backend without starting a local server.
  // Trust its extension pages only; this does not grant desktop IPC privileges.
  if (target.pathname.startsWith(GUEST_PATH_PREFIX) && !target.username && !target.password) {
    try {
      const api = new URL(apiBaseUrl);
      if ((api.protocol === 'http:' || api.protocol === 'https:') && target.origin === api.origin) return false;
    } catch {
      // No valid configured backend: keep refusing network navigation.
    }
  }
  return true;
};
