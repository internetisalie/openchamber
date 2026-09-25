import type { Session } from '@/lib/opencode/model';

export const isSessionArchived = (session: Session): boolean => {
  const archivedAt = session.time?.archived;
  if (!archivedAt) return false;
  if (archivedAt < 0) return true;

  const updatedAt = session.time?.updated;
  return updatedAt === undefined || archivedAt >= updatedAt;
};
