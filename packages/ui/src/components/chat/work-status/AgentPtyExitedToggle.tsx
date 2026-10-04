import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

export const AgentPtyExitedToggle: React.FC = () => {
  const { t } = useI18n();
  const showExited = useUIStore((state) => state.showExitedAgentPtys);
  const setShowExited = useUIStore((state) => state.setShowExitedAgentPtys);
  const label = t(showExited ? 'chat.workStatus.pty.hideExited' : 'chat.workStatus.pty.showExited');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 text-muted-foreground"
          aria-label={label}
          aria-pressed={showExited}
          onClick={() => setShowExited(!showExited)}
        >
          <Icon name={showExited ? 'eye' : 'eye-off'} className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
