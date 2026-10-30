import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { tableExpansionMarkdown } from './table-expansion';

const browser = new Window();
Object.assign(globalThis, { document: browser.document, Node: browser.Node, HTMLElement: browser.HTMLElement });

const expand = (html: string): string => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return tableExpansionMarkdown(host.querySelector('table')!);
};

describe('table dialog snapshot', () => {
  test('keeps cell formatting, links, pipes and line breaks', () => {
    expect(expand('<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td><strong>A|B</strong></td><td>see <a href="https://example.com/x">docs</a>, <code>a | b</code>, <em>soft</em><br>next</td></tr></tbody></table>'))
      .toBe('| Name | Note |\n| --- | --- |\n| **A\\|B** | see [docs](https://example.com/x), `a \\| b`, *soft* next |');
  });
  test('pads short rows', () => {
    expect(expand('<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'))
      .toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
  });
  test('preserves alignment and literal Markdown characters', () => {
    expect(expand('<table><thead><tr><th align="left">L</th><th align="right">R</th><th align="center">C</th><th>N</th></tr></thead><tbody><tr><td>*args, **kwargs</td><td>a_b [x] ~y~ \\z</td><td>1</td><td>2</td></tr></tbody></table>'))
      .toBe('| L | R | C | N |\n| :--- | ---: | :---: | --- |\n| \\*args, \\*\\*kwargs | a\\_b \\[x\\] \\~y\\~ \\\\z | 1 | 2 |');
  });
  test('pads backtick code fences and encodes link destinations', () => {
    expect(expand('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><code>`x`</code> <a href="https://e.com/a b(c)">t</a></td></tr></tbody></table>'))
      .toBe('| A |\n| --- |\n| `` `x` `` [t](https://e.com/a%20b%28c%29) |');
    expect(expand('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><a href="https://e.com/a|b<c>d">t</a> &amp;amp; &amp;</td></tr></tbody></table>'))
      .toBe('| A |\n| --- |\n| [t](https://e.com/a%7Cb%3Cc%3Ed) \\&amp; & |');
  });
  test('recovers math source and omits renderer decoration', () => {
    expect(expand('<table><thead><tr><th>M</th></tr></thead><tbody><tr><td><span data-export-ignore>icon</span><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span></td></tr></tbody></table>'))
      .toBe('| M |\n| --- |\n| $x^2$ |');
  });
});
