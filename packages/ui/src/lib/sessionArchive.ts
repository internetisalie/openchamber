import type { Session } from '@opencode-ai/sdk/v2';

export const isSessionArchived = (session: Session): boolean => {
  const archivedAt = session.time?.archived;
  if (!archivedAt) return false;
  if (archivedAt < 0) return true;

  const updatedAt = session.time?.updated;
  return typeof updatedAt !== 'number' || archivedAt >= updatedAt;
};
