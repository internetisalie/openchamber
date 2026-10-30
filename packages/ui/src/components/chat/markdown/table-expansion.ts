const escapeMarkdownText = (text: string): string =>
  text.replace(/[\\`*_[\]<>~|]/g, '\\$&').replace(/&(?=#?\w+;)/g, '\\&');

const codeSpan = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text.replace(/\|/g, '\\|')}${pad}${fence}`;
};

const inlineMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText((node.textContent ?? '').replace(/\s+/g, ' '));
  if (!(node instanceof HTMLElement)) return '';
  if (node.hasAttribute('data-export-ignore') || node.getAttribute('data-message-image-export-exclude') === 'true') return '';
  const mediaSource = node.getAttribute('data-oc-media-source');
  if (mediaSource) return `[${escapeMarkdownText(node.textContent ?? '')}](${mediaSource})`;
  if (node.classList.contains('katex')) {
    const source = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    return source ? `$${source}$` : escapeMarkdownText(node.textContent ?? '');
  }
  const inner = Array.from(node.childNodes).map(inlineMarkdown).join('');
  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return inner ? `**${inner}**` : '';
    case 'EM':
    case 'I':
      return inner ? `*${inner}*` : '';
    case 'DEL':
    case 'S':
      return inner ? `~~${inner}~~` : '';
    case 'CODE':
      return codeSpan((node.textContent ?? '').replace(/\s+/g, ' '));
    case 'A': {
      const href = node.getAttribute('href')?.replace(/[ ()|<>\\]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
      return href ? `[${inner}](${href})` : inner;
    }
    case 'IMG':
      return node.getAttribute('src') ? `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src')})` : '';
    case 'BR':
      return ' ';
    default:
      return inner;
  }
};

const alignmentRule = (cell: HTMLTableCellElement | undefined): string => {
  const align = (cell?.getAttribute('align') ?? cell?.style.textAlign ?? '').toLowerCase();
  return align === 'left' ? ':---' : align === 'right' ? '---:' : align === 'center' ? ':---:' : '---';
};

/** Snapshot the selected table for the full-size dialog, preserving inline formatting. */
export const tableExpansionMarkdown = (table: HTMLTableElement): string => {
  const cells = (row: Element) => Array.from(row.querySelectorAll<HTMLTableCellElement>('th, td'));
  const headRow = table.querySelector('thead tr');
  const headerCells = headRow ? cells(headRow) : [];
  const head = headerCells.map((cell) => inlineMarkdown(cell).trim());
  const body = Array.from(table.querySelectorAll('tbody tr'))
    .map((row) => cells(row).map((cell) => inlineMarkdown(cell).trim()))
    .filter((row) => row.length > 0);
  const width = Math.max(head.length, ...body.map((row) => row.length), 1);
  const pad = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
  const rules = Array.from({ length: width }, (_, i) => alignmentRule(headerCells[i]));
  return [pad(head), `| ${rules.join(' | ')} |`, ...body.map(pad)].join('\n');
};
