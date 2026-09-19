import type { TerminalChunk } from '@/stores/useTerminalStore';

export const OPENCODE_PTY_OUTPUT_LIMIT_BYTES = 512 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const appendBoundedOpenCodePtyChunk = (
  chunks: TerminalChunk[],
  revision: number,
  data: string,
): TerminalChunk[] => {
  if (!data) return chunks;
  const encoded = encoder.encode(data);
  let offset = Math.max(0, encoded.byteLength - OPENCODE_PTY_OUTPUT_LIMIT_BYTES);
  while (offset < encoded.byteLength && (encoded[offset] & 0xc0) === 0x80) offset += 1;
  const boundedData = offset ? decoder.decode(encoded.subarray(offset)) : data;
  const next = [...chunks, { id: revision, data: boundedData, byteLength: encoded.byteLength - offset }];
  let byteLength = next.reduce((total, chunk) => total + chunk.byteLength, 0);
  while (byteLength > OPENCODE_PTY_OUTPUT_LIMIT_BYTES && next.length > 1) {
    byteLength -= next.shift()?.byteLength ?? 0;
  }
  return next;
};
