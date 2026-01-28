import { mkdirSync, unlinkSync } from 'node:fs';
import type { SessionData, SessionStorage } from './session';
import { SessionDataSchema } from './session';
import { createHash } from 'node:crypto';

export class FileSessionStorage implements SessionStorage {
  constructor(private basePath: string) {
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    try {
      mkdirSync(this.basePath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private getTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  private getFilePath(token: string): string {
    const tokenHash = this.getTokenHash(token);
    return `${this.basePath}/${tokenHash}.json`;
  }

  async save(token: string, session: SessionData): Promise<void> {
    this.ensureDirectory();
    const filePath = this.getFilePath(token);
    const data = SessionDataSchema.parse(session);
    await Bun.write(filePath, JSON.stringify(data, null, 2));
  }

  async load(token: string): Promise<SessionData | null> {
    try {
      const filePath = this.getFilePath(token);
      const file = Bun.file(filePath);
      const content = await file.text();
      const data = JSON.parse(content);
      return SessionDataSchema.parse(data);
    } catch (error) {
      return null;
    }
  }

  async delete(token: string): Promise<void> {
    const filePath = this.getFilePath(token);
    try {
      unlinkSync(filePath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  async exists(token: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(token);
      const file = Bun.file(filePath);
      await file.text();
      return true;
    } catch (error) {
      return false;
    }
  }

  async hasSession(token: string): Promise<boolean> {
    const session = await this.load(token);
    return session !== null;
  }
}

export class WebSocketSessionStorage implements SessionStorage {
  private sessions: Map<string, SessionData> = new Map();

  async save(token: string, session: SessionData): Promise<void> {
    this.sessions.set(token, session);
  }

  async load(token: string): Promise<SessionData | null> {
    return this.sessions.get(token) ?? null;
  }

  async delete(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async exists(token: string): Promise<boolean> {
    return this.sessions.has(token);
  }

  async hasSession(token: string): Promise<boolean> {
    return (await this.load(token)) !== null;
  }
}

export function createSessionStorage(
  type: 'file' | 'websocket' = 'file',
  basePath?: string
): SessionStorage {
  if (type === 'websocket') {
    return new WebSocketSessionStorage();
  }
  return new FileSessionStorage(basePath ?? './.sessions');
}
