import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import type { LocationManifestState } from './location-manifest';
import { LocationSectionContent } from './work-status-location-details';
import { WorkStatusSection } from './WorkStatusPrimitives';

const render = (state: LocationManifestState) => renderToStaticMarkup(
  <I18nProvider>
    <WorkStatusSection title="Session"><span>Session readout</span></WorkStatusSection>
    <LocationSectionContent directory="/work/plain-folder" state={state}>
      <span>Existing Git readout</span>
    </LocationSectionContent>
    <WorkStatusSection title="Usage"><span>Usage readout</span></WorkStatusSection>
  </I18nProvider>,
);

test('Location replaces the project caption and keeps a plain directory without invented checkout metadata', () => {
  const html = render({ status: 'missing' });
  expect(html).toContain('Location');
  expect(html).toContain('/work/plain-folder');
  expect(html).not.toContain('Project');
  expect(html).not.toContain('refs/');
  expect(html).not.toContain('manifest');
  for (const text of ['Session readout', 'Existing Git readout', 'Usage readout']) expect(html).toContain(text);
});

test('invalid, failed, unsupported and loading states leave native directory and other readouts visible', () => {
  for (const [status, message] of [
    ['invalid', 'Workspace manifest is invalid or belongs to another container.'],
    ['failed', 'Could not read the workspace manifest.'],
    ['unsupported', 'File preview is unavailable in this runtime.'],
    ['loading', 'Loading...'],
  ] as const) {
    const html = render({ status });
    expect(html).toContain(message);
    expect(html).toContain('/work/plain-folder');
    expect(html).toContain('Session readout');
    expect(html).toContain('Usage readout');
    expect(html).toContain('Existing Git readout');
  }
});

test('shows structural member roles, repositories, directories and pins without live seat attribution', () => {
  const html = render({ status: 'ready', manifest: { version: 1, container: '/work/plain-folder', members: [
    { dir: 'app', role: 'project', repo: 'example/app', pin: { sha: 'a'.repeat(40), ref: 'refs/heads/main', branch: 'poc/location' } },
    { dir: 'base', role: 'base', repo: 'example/base', pin: { sha: 'b'.repeat(40), ref: 'refs/tags/v1', branch: 'poc/location' } },
  ] } });
  for (const text of ['project', 'example/app', 'base', 'example/base', 'aaaaaaaaaaaa', 'refs/heads/main', 'refs/tags/v1']) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain('implementer');
  expect(html).not.toContain('lane');
  expect(html).toContain('Session readout');
  expect(html).toContain('Usage readout');
});
