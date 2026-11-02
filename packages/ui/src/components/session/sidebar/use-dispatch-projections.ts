import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { captureRuntimeInstance, getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { loadDispatchProjections, planDispatchProjectionReads, type DispatchReadTarget } from './dispatch-projection-loader';
import { dispatchSessionKey, type DispatchProjectionState, type WorkspaceDispatchAttribution } from './dispatch-projection';

export function useDispatchProjections(source: string, sessions: readonly { id: string; directory: string }[], enabled: boolean): WorkspaceDispatchAttribution {
  const { files } = useRuntimeAPIs();
  const readNativeFile = files.readNativeFile;
  const nativeFiles = React.useMemo(() => ({ readNativeFile }), [readNativeFile]);
  const signature = JSON.stringify(planDispatchProjectionReads(sessions));
  const targets: DispatchReadTarget[] = React.useMemo(() => JSON.parse(signature), [signature]);
  const [result, setResult] = React.useState<{
    source: string; files: typeof nativeFiles; targets: readonly DispatchReadTarget[]; current: () => boolean; value: WorkspaceDispatchAttribution;
  } | null>(null);
  React.useEffect(() => {
    if (!enabled || source !== getRuntimeKey()) return;
    const controller = new AbortController();
    const sameInstance = captureRuntimeInstance();
    const unsubscribe = subscribeRuntimeEndpointWillChange(() => controller.abort());
    const current = () => !controller.signal.aborted && sameInstance() && source === getRuntimeKey();
    void loadDispatchProjections({ source, files: nativeFiles, targets, signal: controller.signal, isCurrent: current }).then((value) => {
      if (value && current()) setResult({ source, files: nativeFiles, targets, current, value });
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [enabled, source, nativeFiles, targets]);
  const pending = React.useMemo<WorkspaceDispatchAttribution>(() => {
    const state: DispatchProjectionState = { status: enabled ? 'loading' : 'unrequested' };
    return { status: 'scoped', source,
      workspaces: new Map(targets.filter((target) => target.sessionID === undefined).map((target) => [target.directory, state])),
      sessions: new Map(targets.flatMap((target) => target.sessionID === undefined ? []
        : [[dispatchSessionKey(target.directory, target.sessionID), state] as const])) };
  }, [enabled, source, targets]);
  return enabled && result?.source === source && result.files === nativeFiles && result.targets === targets && result.current()
    ? result.value : pending;
}
