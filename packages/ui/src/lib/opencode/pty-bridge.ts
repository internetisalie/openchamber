import { z } from 'zod';

import { runtimeFetch } from '../runtime-fetch';

const BRIDGE_PATH = '/api/plugins/opencode-pty-bridge';

const capabilitySchema = z.object({
  id: z.literal('opencode-pty-bridge'),
  schemaVersion: z.literal(1),
  opencodePtyVersion: z.string().min(1),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  parentSessionId: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  command: z.string(),
  args: z.array(z.string()),
  workdir: z.string(),
  status: z.enum(['running', 'exited', 'killing', 'killed']),
  exitCode: z.number().int().optional(),
  createdAt: z.string().min(1),
});

const sessionListSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  sessions: z.array(sessionSchema),
});

const outputSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  reset: z.boolean(),
  data: z.string(),
});

type OpenCodePtyCapability = z.infer<typeof capabilitySchema>;
export type OpenCodePtySession = z.infer<typeof sessionSchema>;
type OpenCodePtySessionList = z.infer<typeof sessionListSchema>;
type OpenCodePtyOutput = z.infer<typeof outputSchema>;

type OpenCodePtyCapabilityResult =
  | { status: 'available'; capability: OpenCodePtyCapability }
  | { status: 'absent' }
  | { status: 'authentication-error' };

export class OpenCodePtyApiError extends Error {
  readonly kind: 'authentication' | 'not-found' | 'http' | 'invalid-response';
  readonly status: number | null;

  constructor(kind: OpenCodePtyApiError['kind'], status: number | null = null) {
    super(`OpenCode PTY bridge request failed: ${kind}`);
    this.name = 'OpenCodePtyApiError';
    this.kind = kind;
    this.status = status;
  }
}

const request = (path: string, signal?: AbortSignal, query?: Record<string, string | number>) =>
  runtimeFetch(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
    query,
  });

const parseResponse = async <T>(response: Response, schema: z.ZodType<T>): Promise<T> => {
  if (response.status === 401 || response.status === 403) {
    throw new OpenCodePtyApiError('authentication', response.status);
  }
  if (response.status === 404) {
    throw new OpenCodePtyApiError('not-found', response.status);
  }
  if (!response.ok) {
    throw new OpenCodePtyApiError('http', response.status);
  }

  const payload = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new OpenCodePtyApiError('invalid-response', response.status);
  }
  return parsed.data;
};

export const probeOpenCodePtyBridge = async (signal?: AbortSignal): Promise<OpenCodePtyCapabilityResult> => {
  const response = await request(BRIDGE_PATH, signal);
  if (response.status === 404) return { status: 'absent' };
  if (response.status === 401 || response.status === 403) return { status: 'authentication-error' };
  return { status: 'available', capability: await parseResponse(response, capabilitySchema) };
};

export const listOpenCodePtySessions = async (signal?: AbortSignal): Promise<OpenCodePtySessionList> =>
  parseResponse(await request(`${BRIDGE_PATH}/sessions`, signal), sessionListSchema);

export const readOpenCodePtyOutput = async (
  sessionId: string,
  after?: number,
  signal?: AbortSignal,
): Promise<OpenCodePtyOutput> =>
  parseResponse(
    await request(
      `${BRIDGE_PATH}/sessions/${encodeURIComponent(sessionId)}/output`,
      signal,
      after === undefined ? undefined : { after },
    ),
    outputSchema,
  );
