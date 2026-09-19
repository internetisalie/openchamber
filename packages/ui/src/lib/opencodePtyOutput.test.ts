import { describe, expect, test } from 'bun:test';

import {
  appendBoundedOpenCodePtyChunk,
  OPENCODE_PTY_OUTPUT_LIMIT_BYTES,
} from './opencodePtyOutput';

describe('appendBoundedOpenCodePtyChunk', () => {
  test('keeps only the tail of an oversized response without splitting UTF-8', () => {
    const data = `${'x'.repeat(OPENCODE_PTY_OUTPUT_LIMIT_BYTES)}\u{1F642}`;
    const chunks = appendBoundedOpenCodePtyChunk([], 4, data);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.data.endsWith('\u{1F642}')).toBe(true);
    expect(chunks[0]?.data.startsWith('xxxx')).toBe(true);
    expect(chunks[0]?.byteLength).toBeLessThanOrEqual(OPENCODE_PTY_OUTPUT_LIMIT_BYTES);
    expect(new TextEncoder().encode(chunks[0]?.data).byteLength).toBe(chunks[0]?.byteLength);
  });

  test('drops complete old chunks to stay within the limit', () => {
    const first = appendBoundedOpenCodePtyChunk([], 1, 'x'.repeat(OPENCODE_PTY_OUTPUT_LIMIT_BYTES));
    const chunks = appendBoundedOpenCodePtyChunk(first, 2, 'new');

    expect(chunks).toEqual([{ id: 2, data: 'new', byteLength: 3 }]);
  });
});
