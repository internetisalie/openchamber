import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldBlockGuestFrameNavigation } from './guest-frame-navigation.mjs';

const isAppOrigin = (url) => new URL(url).origin === 'http://127.0.0.1:3902';
const guest = (url) => shouldBlockGuestFrameNavigation({ isMainFrame: false, frameOrigin: 'null', url, isAppOrigin });

test('refuses an extension frame leaving for any other address', () => {
  for (const url of [
    'https://example.com/?data=conversation',
    'http://127.0.0.1:3902/api/session',
    'http://127.0.0.1:3902/',
    'http://127.0.0.1:9999/api/guests/demo/index.html',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(guest(url), true, url);
  }
});

test('lets an extension frame load its own pages and local documents', () => {
  for (const url of [
    'http://127.0.0.1:3902/api/guests/demo/index.html?oc_url_token=x',
    'http://127.0.0.1:3902/api/guests/demo/other/page.html',
    'about:srcdoc',
    'about:blank',
    'data:text/html,<p>hi</p>',
    'blob:http://127.0.0.1:3902/0f2d',
  ]) {
    assert.equal(guest(url), false, url);
  }
});

test('leaves the main frame and frames with an origin of their own alone', () => {
  assert.equal(shouldBlockGuestFrameNavigation({ isMainFrame: true, frameOrigin: 'null', url: 'https://example.com/', isAppOrigin }), false);
  assert.equal(shouldBlockGuestFrameNavigation({ isMainFrame: false, frameOrigin: 'https://docs.example', url: 'https://example.com/', isAppOrigin }), false);
});

test('loads extension pages from the configured backend when bundled UI has no local server', () => {
  const input = { isMainFrame: false, frameOrigin: 'null', isAppOrigin: () => false, apiBaseUrl: 'http://127.0.0.1:3037' };
  assert.equal(shouldBlockGuestFrameNavigation({ ...input, url: 'http://127.0.0.1:3037/api/guests/agent-memory/index.html' }), false);
  for (const url of [
    'http://127.0.0.1:3037/api/session',
    'http://127.0.0.1:3037/',
    'http://127.0.0.1:3038/api/guests/agent-memory/index.html',
    'https://example.com/api/guests/agent-memory/index.html',
    'http://user:secret@127.0.0.1:3037/api/guests/agent-memory/index.html',
  ]) assert.equal(shouldBlockGuestFrameNavigation({ ...input, url }), true, url);
});

test('uses the window backend and fails closed for missing or non-HTTP backend URLs', () => {
  const input = { isMainFrame: false, frameOrigin: 'null', isAppOrigin: () => false, url: 'https://backend.example/api/guests/agent-memory/index.html' };
  assert.equal(shouldBlockGuestFrameNavigation({ ...input, apiBaseUrl: 'https://backend.example/' }), false);
  for (const apiBaseUrl of [undefined, '', 'invalid', 'file:///app', 'openchamber-ui://app', 'https://other.example']) {
    assert.equal(shouldBlockGuestFrameNavigation({ ...input, apiBaseUrl }), true, String(apiBaseUrl));
  }
});
