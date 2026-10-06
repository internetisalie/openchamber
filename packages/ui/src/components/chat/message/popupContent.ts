import type { ToolPopupContent } from './types';

// The chat message shows these popups in the tool dialog; any other popup content is not its to show.
export const opensInChatDialog = (content: ToolPopupContent): boolean =>
    Boolean(content.image || content.mermaid || content.metadata?.tool === 'markdown-table');

// A table has more columns than a message column holds, so its dialog is wider than the 5xl default.
export const isTablePopup = (content: ToolPopupContent): boolean => content.metadata?.tool === 'markdown-table';
