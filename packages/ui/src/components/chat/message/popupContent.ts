import type { ToolPopupContent } from './types';

// A table has more columns than a message column holds, so its dialog is wider than the 5xl default.
export const isTablePopup = (content: ToolPopupContent): boolean => content.metadata?.tool === 'markdown-table';
