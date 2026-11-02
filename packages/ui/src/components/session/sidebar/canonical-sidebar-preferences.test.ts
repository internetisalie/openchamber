import { expect, test } from 'bun:test';
import { useCanonicalSidebarPreferences } from './canonical-sidebar-preferences';

test('manual move preserves sibling order and unrelated workspace preferences', () => {
  useCanonicalSidebarPreferences.setState({ workspaceOrder: 'a-z', manualOrder: ['elsewhere'] });
  useCanonicalSidebarPreferences.getState().moveWorkspace('c', 'b', ['a', 'b', 'c']);
  expect(useCanonicalSidebarPreferences.getState().manualOrder).toEqual(['elsewhere', 'a', 'c', 'b']);
  expect(useCanonicalSidebarPreferences.getState().workspaceOrder).toBe('manual');
  useCanonicalSidebarPreferences.getState().moveWorkspace('c', 'a', ['a', 'c', 'b']);
  expect(useCanonicalSidebarPreferences.getState().manualOrder).toEqual(['elsewhere', 'c', 'a', 'b']);
});

test('invalid manual move cannot insert a workspace outside its sibling group', () => {
  useCanonicalSidebarPreferences.setState({ workspaceOrder: 'manual', manualOrder: ['a', 'b'] });
  useCanonicalSidebarPreferences.getState().moveWorkspace('foreign', 'a', ['a', 'b']);
  expect(useCanonicalSidebarPreferences.getState().manualOrder).toEqual(['a', 'b']);
});
