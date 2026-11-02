import { expect, test } from 'bun:test';
import { canReadWorkspaceComposition } from './workspace-composition-access';

test('composition reads require the exact selected native container and current source', () => {
  expect(canReadWorkspaceComposition('a', 'a', '/container', '/container')).toBe(true);
  expect(canReadWorkspaceComposition('a', 'b', '/container', '/container')).toBe(false);
  expect(canReadWorkspaceComposition('a', 'a', '/container', '/container/checkout')).toBe(false);
  expect(canReadWorkspaceComposition('a', 'a', '/container', undefined)).toBe(false);
  expect(canReadWorkspaceComposition('a', 'a', '/other', '/container')).toBe(false);
});
