import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { attachMarkdownInteractions, decorateMarkdown, type DecorateContext } from './decorate';

const window = new Window();
Object.assign(globalThis, {
  document: window.document,
  window,
  Node: window.Node,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLTableElement: window.HTMLTableElement,
});

const labels: DecorateContext['labels'] = {
  copy: 'Copy', copied: 'Copied', enableCodeWrap: 'Wrap', disableCodeWrap: 'Do not wrap',
  copyTable: 'Copy table', downloadTable: 'Download table', expandTable: 'Expand table',
  copyDiagram: 'Copy diagram', downloadDiagram: 'Download diagram',
  zoomInDiagram: 'Zoom in', zoomOutDiagram: 'Zoom out', resetDiagramView: 'Reset',
  previewLabel: 'Preview', previewTitle: 'Preview',
};

const context = (onExpandTable?: DecorateContext['onExpandTable']): DecorateContext => ({
  labels,
  mermaidControls: { download: false, copy: false, showPanZoomControls: false },
  codeBlockLineWrap: false,
  renderMermaid: () => ({}),
  onExpandTable,
});

const mount = (html: string, ctx: DecorateContext) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  decorateMarkdown(host, ctx);
  const detach = attachMarkdownInteractions(host, ctx);
  return { host, detach };
};

const TABLE = '<table><thead><tr><th>#</th><th>Question</th></tr></thead><tbody><tr><td>M-01</td><td>Which messages may be lost?</td></tr></tbody></table>';

describe('expand table button', () => {
  test('is absent when the host cannot show a dialog', () => {
    const { host, detach } = mount(TABLE, context());
    expect(host.querySelector('[data-md-action="table-expand"]')).toBeNull();
    expect(host.querySelector('[data-md-action="table-copy-toggle"]')).not.toBeNull();
    detach();
    host.remove();
  });

  test('is the first toolbar button when it can, and hands the table over as markdown', () => {
    const calls: string[] = [];
    const { host, detach } = mount(TABLE, context((table) => calls.push(table.markdown)));
    const button = host.querySelector('[data-md-action="table-expand"]');
    expect(button?.getAttribute('aria-label')).toBe('Expand table');
    expect(button?.parentElement?.firstElementChild).toBe(button);
    (button as HTMLElement).click();
    expect(calls).toEqual(['| # | Question |\n| --- | --- |\n| M-01 | Which messages may be lost? |']);
    detach();
    host.remove();
  });

  test('keeps the formatting of a cell and escapes pipes', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td><strong>A|B</strong></td><td>see <a href="https://example.com/x">docs</a>, <code>a | b</code>, <em>soft</em><br>next</td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| Name | Note |\n| --- | --- |\n| **A\\|B** | see [docs](https://example.com/x), `a \\| b`, *soft* next |');
    detach();
    host.remove();
  });

  test('pads a short row to the widest one', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
    detach();
    host.remove();
  });

  test('keeps column alignment and escapes markdown characters in plain text', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th align="left">L</th><th align="right">R</th><th align="center">C</th><th>N</th></tr></thead><tbody><tr><td>*args, **kwargs</td><td>a_b [x] ~y~ \\z</td><td>1</td><td>2</td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| L | R | C | N |\n| :--- | ---: | :---: | --- |\n| \\*args, \\*\\*kwargs | a\\_b \\[x\\] \\~y\\~ \\\\z | 1 | 2 |');
    detach();
    host.remove();
  });

  test('pads a code span that starts or ends with a backtick and encodes link targets', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><code>`x`</code> <a href="https://e.com/a b(c)">t</a></td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| A |\n| --- |\n| `` `x` `` [t](https://e.com/a%20b%28c%29) |');
    detach();
    host.remove();
  });

  test('turns rendered math back into its source', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th>M</th></tr></thead><tbody><tr><td><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span></td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| M |\n| --- |\n| $x^2$ |');
    detach();
    host.remove();
  });

  test('encodes characters in a link target that would split the table or end the link', () => {
    const calls: string[] = [];
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><a href="https://e.com/a|b<c>d">t</a> &amp;amp; &amp;</td></tr></tbody></table>';
    const { host, detach } = mount(html, context((table) => calls.push(table.markdown)));
    (host.querySelector('[data-md-action="table-expand"]') as HTMLElement).click();
    expect(calls[0]).toBe('| A |\n| --- |\n| [t](https://e.com/a%7Cb%3Cc%3Ed) \\&amp; & |');
    detach();
    host.remove();
  });
});
