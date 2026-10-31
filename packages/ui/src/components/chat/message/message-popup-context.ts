import React from 'react';
import type { ToolPopupContent } from './types';

export const MessagePopupContext = React.createContext<((content: ToolPopupContent) => void) | null>(null);
export const useMessagePopupOwner = () => React.useContext(MessagePopupContext);
