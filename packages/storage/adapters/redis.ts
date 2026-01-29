import { RedisClient } from "bun";
import { z } from "zod";
import { BaseStorage } from "./base";
import type { CollectionSchema, RedisConfig, StorageEvents } from "../types";

export class RedisAdapter<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
> extends BaseStorage<TCollections, TSchema, TEvents> {
  private client: RedisClient;
  private connected: boolean = false;
  private config: Required<RedisConfig>;

  constructor(
    schema: TSchema,
    config: RedisConfig = {},
    logger?: import("@paws/debug-logger").DebugLogger
  ) {
    super(schema, logger);
    this.config = {
      url: config.url ?? 'redis://localhost:6379',
      database: config.database ?? 0
    };
    
    const url = new URL(this.config.url);
    if (url.pathname && url.pathname !== '/' && this.config.database === 0) {
      const dbNum = parseInt(url.pathname.substring(1));
      if (!isNaN(dbNum)) {
        this.config.database = dbNum;
      }
    }

    const connectionString = `${url.protocol}//${url.host}${url.pathname}`;
    
    this.client = new RedisClient(connectionString, {
      autoReconnect: true,
      maxRetries: 10,
      enableOfflineQueue: true
    });

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.client.onconnect = () => {
      this.connected = true;
      super.emit('connected' as never, undefined as never);
      this.logger.logInfo('Redis connection established');
    };

    this.client.onclose = (error) => {
      this.connected = false;
      super.emit('disconnected' as never, undefined as never);
      if (error) {
        this.logger.logError('Redis connection closed', error);
      } else {
        this.logger.logInfo('Redis connection closed');
      }
    };
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      try {
        await this.client.connect();
      } catch (error) {
        this.logger.logError('Failed to connect to Redis', error);
        super.emit('error' as never, error as never);
        throw error;
      }
    }
  }

  private formatKey(collection: string, key: string): string {
    return `${collection}:${key}`;
  }

  private parseKey(key: string): { collection: string; key: string } {
    const colonIndex = key.indexOf(':');
    if (colonIndex === -1) {
      return { collection: '', key };
    }
    return {
      collection: key.substring(0, colonIndex),
      key: key.substring(colonIndex + 1)
    };
  }

  private serialize(value: unknown): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(value: string | null): T | null {
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async get<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<z.infer<TSchema[TCollection][typeof key]> | null> {
    try {
      await this.ensureConnected();
      
      const redisKey = this.formatKey(collection as string, String(key));
      const value = await this.client.get(redisKey);
      
      if (value === null) {
        super.emit('get' as never, { collection: collection as string, key: String(key), value: null } as never);
        this.logger.logDebug(`Get ${collection}.${String(key)} - not found`);
        return null;
      }

      const deserialized = this.deserialize(value);
      const validated = this.validate(collection, key, deserialized);
      
      super.emit('get' as never, { collection: collection as string, key: String(key), value: validated } as never);
      this.logger.logDebug(`Get ${collection}.${String(key)}`, validated);
      return validated as z.infer<TSchema[TCollection][typeof key]> | null;
    } catch (error) {
      this.logger.logError(`Failed to get ${collection}.${String(key)}`, error);
      super.emit('error' as never, error as never);
      throw error;
    }
  }

  async has<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      const redisKey = this.formatKey(collection as string, String(key));
      const exists = await this.client.exists(redisKey);
      
      return exists === true;
    } catch (error) {
      this.logger.logError(`Failed to check existence of ${collection}.${String(key)}`, error);
      return false;
    }
  }

  async set<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection],
    value: z.input<TSchema[TCollection][typeof key]>
  ): Promise<void> {
    try {
      await this.ensureConnected();
      
      const validated = this.validate(collection, key, value);
      const redisKey = this.formatKey(collection as string, String(key));
      const serialized = this.serialize(validated);
      
      await this.client.set(redisKey, serialized);
      
      super.emit('set' as never, { collection: collection as string, key: String(key), value: validated } as never);
      this.logger.logDebug(`Set ${collection}.${String(key)}`, validated);
    } catch (error) {
      this.logger.logError(`Failed to set ${collection}.${String(key)}`, error);
      super.emit('error' as never, error as never);
      throw error;
    }
  }

  async delete<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      const redisKey = this.formatKey(collection as string, String(key));
      const result = await this.client.del(redisKey);
      
      const success = result === 1;
      super.emit('delete' as never, { collection: collection as string, key: String(key), success } as never);
      this.logger.logDebug(`Delete ${collection}.${String(key)}`, { success });
      
      return success;
    } catch (error) {
      this.logger.logError(`Failed to delete ${collection}.${String(key)}`, error);
      super.emit('error' as never, error as never);
      throw error;
    }
  }

  async clear<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<void> {
    try {
      await this.ensureConnected();
      
      if (collection) {
        const pattern = `${collection as string}:*`;
        const keys = await this.client.send("KEYS", [pattern]) as string[];
        
        if (keys && keys.length > 0) {
          await this.client.send("DEL", keys);
        }
        
        super.emit('clear' as never, { collection: collection as string, count: keys?.length ?? 0 } as never);
        this.logger.logDebug(`Clear ${collection}`, { count: keys?.length ?? 0 });
      } else {
        const keys = await this.client.send("KEYS", ["*"]) as string[];
        
        if (keys && keys.length > 0) {
          await this.client.send("DEL", keys);
        }
        
        super.emit('clear' as never, { collection: undefined, count: keys?.length ?? 0 } as never);
        this.logger.logDebug('Clear all collections', { count: keys?.length ?? 0 });
      }
    } catch (error) {
      this.logger.logError('Failed to clear storage', error);
      super.emit('error' as never, error as never);
      throw error;
    }
  }

  async size<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<number> {
    try {
      await this.ensureConnected();
      
      if (collection) {
        const pattern = `${collection as string}:*`;
        const keys = await this.client.send("KEYS", [pattern]) as string[];
        return keys?.length ?? 0;
      } else {
        const keys = await this.client.send("KEYS", ["*"]) as string[];
        return keys?.length ?? 0;
      }
    } catch (error) {
      this.logger.logError('Failed to get storage size', error);
      return 0;
    }
  }

  async keys<TCollection extends TCollections>(
    collection: TCollection
  ): Promise<Array<keyof TSchema[TCollection]>> {
    try {
      await this.ensureConnected();
      
      const pattern = `${collection as string}:*`;
      const keys = await this.client.send("KEYS", [pattern]) as string[];
      
      if (!keys || keys.length === 0) {
        return [];
      }
      
      return keys
        .map(key => {
          const parsed = this.parseKey(key);
          return parsed.key as keyof TSchema[TCollection];
        })
        .filter(key => key !== undefined && key !== '');
    } catch (error) {
      this.logger.logError(`Failed to get keys for collection ${collection}`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    try {
      this.client.close();
      this.connected = false;
      this.removeAllListeners();
      this.logger.logInfo('Redis client closed');
    } catch (error) {
      this.logger.logError('Error closing Redis client', error);
    }
  }
}
