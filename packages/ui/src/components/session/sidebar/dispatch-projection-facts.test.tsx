import { afterEach, beforeEach, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DispatchProjectionFacts } from './dispatch-projection-facts';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { dict } from '@/lib/i18n/messages/en';

let previous = useI18nStore.getState();
beforeEach(() => {
  previous = useI18nStore.getState();
  useI18nStore.setState({ locale: 'en', dictionary: dict });
});
afterEach(() => useI18nStore.setState(previous));
const render = (element: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{element}</I18nProvider>);

test('shows captured agent, explicit chore and literal phase without assigning a role from a title', () => {
  const html = render(<DispatchProjectionFacts state={{ schema: 'loom.dispatch-projection.v1', status: 'known',
    workspace: '/published', sessionID: 'ses_one', agent: 'reviewer', context: {
      container: '/runtime', lane: 'loom.location', item: null, phase: { selector: 'phase 2: exact selector' },
    } }} />);
  expect(html).toContain('reviewer');
  expect(html).toContain('Chore');
  expect(html).toContain('phase 2: exact selector');
  expect(html).not.toContain('coder');
});

test('legacy context remains unknown even when its captured agent is available', () => {
  const html = render(<DispatchProjectionFacts state={{ schema: 'loom.dispatch-projection.v1', status: 'legacy-unknown',
    workspace: '/published', sessionID: 'ses_one', agent: 'planner' }} />);
  expect(html).toContain('Historical context unknown');
  expect(html).toContain('planner');
  expect(html).not.toContain('Chore');
  expect(html).not.toContain('loom.location');
});

test('workspace default and session history have distinct labels and refusal stays distinct from missing', () => {
  const workspace = render(<DispatchProjectionFacts workspace conflict state={{ status: 'refused' }} />);
  const history = render(<DispatchProjectionFacts state={{ schema: 'loom.dispatch-projection.v1', status: 'missing',
    workspace: '/published', sessionID: 'ses_one' }} />);
  expect(workspace).toContain('Workspace default');
  expect(workspace).toContain('Projection read refused');
  expect(workspace).toContain('Conflicting lane context');
  expect(history).toContain('Session dispatch');
  expect(history).toContain('No dispatch record');
});
