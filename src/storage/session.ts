import { z } from 'zod';

export const SessionDataSchema = z.object({
  token: z.string(),
  sessionId: z.string(),
  sequence: z.number(),
  resumeGatewayUrl: z.string(),
  timestamp: z.number(),
  userId: z.string().optional()
});

export type SessionData = z.infer<typeof SessionDataSchema>;

export interface SessionStorage {
  save(token: string, session: SessionData): Promise<void>;
  load(token: string): Promise<SessionData | null>;
  delete(token: string): Promise<void>;
  exists(token: string): Promise<boolean>;
  hasSession(token: string): Promise<boolean>;
}

export const DEFAULT_SESSION_PATH = './.sessions';
