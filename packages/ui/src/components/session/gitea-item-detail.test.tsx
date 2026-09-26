import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import type { GiteaItemDetail } from '@/lib/api/types';
import type { RuntimeAPIs } from '@/lib/api/types';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { GiteaItemDetailView } from './gitea-item-detail';

const detail: GiteaItemDetail = {
  repo: { instanceUrl: 'https://git.example.com', owner: 'team', name: 'project', remote: 'origin' },
  item: { kind: 'pr', number: 20, title: 'Update docs', body: 'Explains the change',
    url: 'https://git.example.com/team/project/pulls/20', state: 'closed', author: 'alice' },
  pull: { draft: false, merged: true, sourceBranch: 'feature', targetBranch: 'main', sourceOwner: 'alice', headSha: null },
  comments: [{ author: 'bob', body: 'Looks good' }], commentsTruncated: false,
};

function render(value: GiteaItemDetail) {
  return renderToStaticMarkup(<I18nProvider><RuntimeAPIContext.Provider value={{} as RuntimeAPIs}>
    <GiteaItemDetailView detail={value} directory="/repo" onComment={async () => {}} />
  </RuntimeAPIContext.Provider></I18nProvider>);
}

describe('Gitea item detail', () => {
  test('shows confirmed pull request details and conversation', () => {
    const html = render(detail);
    expect(html).toContain('Update docs');
    expect(html).toContain('Merged');
    expect(html).toContain('alice:feature → main');
    expect(html).toContain('Explains the change');
    expect(html).toContain('Looks good');
    expect(html).toContain('Post comment');
  });

  test('does not invent branches or a merged state when Gitea omits them', () => {
    const html = render({ ...detail, item: { ...detail.item, kind: 'issue', state: 'open' }, pull: null,
      comments: [], commentsTruncated: true });
    expect(html).toContain('Open');
    expect(html).not.toContain('feature → main');
    expect(html).not.toContain('Merged');
    expect(html).toContain('Some comments are not shown');
  });
});
