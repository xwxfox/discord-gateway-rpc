import type { RpcConfig } from '../presence/config';
import { parseRpcConfig } from '../presence/config';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';

export interface ConfigStorage {
  save(name: string, config: RpcConfig): Promise<void>;
  load(name: string): Promise<RpcConfig | null>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}

export class JsonConfigStorage implements ConfigStorage {
  constructor(private basePath = '@/configs') { }

  private ensureDirectory(): void {
    try {
      mkdirSync(this.basePath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private getFilePath(name: string): string {
    return `${this.basePath}/${name}.json`;
  }

  async save(name: string, config: RpcConfig): Promise<void> {
    this.ensureDirectory();
    const filePath = this.getFilePath(name);
    await Bun.write(filePath, JSON.stringify(config, null, 2));
  }

  async load(name: string): Promise<RpcConfig | null> {
    try {
      const filePath = this.getFilePath(name);
      const file = Bun.file(filePath);
      const content = await file.text();
      return parseRpcConfig(JSON.parse(content));
    } catch (error) {
      return null;
    }
  }

  async list(): Promise<string[]> {
    this.ensureDirectory();
    try {
      const entries = readdirSync(this.basePath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name.replace(/\.json$/, ''));
    } catch (error) {
      return [];
    }
  }

  async delete(name: string): Promise<void> {
    const filePath = this.getFilePath(name);
    try {
      unlinkSync(filePath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }
}

export class WebSocketConfigStorage implements ConfigStorage {
  private configs: Map<string, RpcConfig> = new Map();

  constructor() { }

  async save(name: string, config: RpcConfig): Promise<void> {
    this.configs.set(name, config);
  }

  async load(name: string): Promise<RpcConfig | null> {
    return this.configs.get(name) ?? null;
  }

  async list(): Promise<string[]> {
    return Array.from(this.configs.keys());
  }

  async delete(name: string): Promise<void> {
    this.configs.delete(name);
  }
}

export function createConfigStorage(type: 'json' | 'websocket' = 'json', basePath?: string): ConfigStorage {
  if (type === 'websocket') {
    return new WebSocketConfigStorage();
  }
  return new JsonConfigStorage(basePath);
}
