import React from 'react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

export const AgentPtyExitedToggle: React.FC = () => {
  const { t } = useI18n();
  const showExited = useUIStore((state) => state.showExitedAgentPtys);
  const setShowExited = useUIStore((state) => state.setShowExitedAgentPtys);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
      aria-pressed={showExited}
      onClick={() => setShowExited(!showExited)}
    >
      {t(showExited ? 'chat.workStatus.pty.hideExited' : 'chat.workStatus.pty.showExited')}
    </Button>
  );
};
