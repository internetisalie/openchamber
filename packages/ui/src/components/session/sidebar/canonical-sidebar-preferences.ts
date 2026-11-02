import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import type { WorkspaceOrder } from './canonical-location-model';

type Preferences = {
  workspaceOrder: WorkspaceOrder;
  manualOrder: string[];
  setWorkspaceOrder: (order: WorkspaceOrder) => void;
  moveWorkspace: (key: string, before: string, siblings: readonly string[]) => void;
};

export const useCanonicalSidebarPreferences = create<Preferences>()(persist((set) => ({
  workspaceOrder: 'manual', manualOrder: [],
  setWorkspaceOrder: (workspaceOrder) => set({ workspaceOrder }),
  moveWorkspace: (key, before, siblings) => set((state) => {
    const reordered = siblings.filter((entry) => entry !== key);
    const index = reordered.indexOf(before);
    if (index < 0 || !siblings.includes(key)) return state;
    reordered.splice(index, 0, key);
    const manualOrder = [...state.manualOrder.filter((entry) => !siblings.includes(entry)), ...reordered];
    return { workspaceOrder: 'manual', manualOrder };
  }),
}), { name: 'oc.location-sidebar-order', merge: (stored, current) => {
  const parsed = z.object({ workspaceOrder: z.enum(['manual', 'a-z', 'recent']), manualOrder: z.array(z.string()) }).safeParse(stored);
  return parsed.success ? { ...current, ...parsed.data } : current;
} }));
