import { RedisClient } from "bun";
import { z } from "zod";
import { BaseStorage } from "@paws/storage/adapters/base";
import type { CollectionSchema, RedisConfig, StorageEvents } from "@paws/storage/types";

export class UserRedisAdapter<
    TCollections extends string,
    TSchema extends CollectionSchema<TCollections>,
    TEvents extends StorageEvents = StorageEvents
> extends BaseStorage<TCollections, TSchema, TEvents> {
    private client: RedisClient;
    private connected: boolean = false;
    private config: Required<RedisConfig>;
    private prefix: string;

    constructor(
        schema: TSchema,
        config: RedisConfig = {},
        prefix: string,
        logger?: import("@paws/debug-logger").DebugLogger,
        sharedClient?: RedisClient
    ) {
        super(schema, logger);
        this.config = {
            url: config.url ?? 'redis://localhost:6379',
            database: config.database ?? 0
        };
        this.prefix = prefix;

        if (sharedClient) {
            this.client = sharedClient;
            this.connected = true;
            this.setupConnectionHandlers();
        } else {
            const url = new URL(this.config.url);
            if (url.pathname && url.pathname !== '/' && this.config.database === 0) {
                const dbNum = parseInt(url.pathname.substring(1));
                if (!isNaN(dbNum)) {
                    this.config.database = dbNum;
                }
            }

            const connectionString = `${url.protocol}//${url.username}:${url.password}@${url.host}${url.pathname}`;
            this.client = new RedisClient(connectionString, {
                autoReconnect: true,
                maxRetries: 10,
                enableOfflineQueue: true
            });

            this.setupConnectionHandlers();
        }
    }

    private setupConnectionHandlers(): void {
        if (this.connected) {
            return;
        }

        this.client.onconnect = () => {
            this.connected = true;
            super.emit('connected' as never, undefined as never);
            this.logger.logInfo(`Redis connection established [${this.prefix}]`);
        };

        this.client.onclose = (error) => {
            this.connected = false;
            super.emit('disconnected' as never, undefined as never);
            if (error) {
                this.logger.logError(`Redis connection closed [${this.prefix}]`, error);
            } else {
                this.logger.logInfo(`Redis connection closed [${this.prefix}]`);
            }
        };
    }

    private async ensureConnected(): Promise<void> {
        if (!this.connected) {
            try {
                await this.client.connect();
            } catch (error) {
                this.logger.logError(`Failed to connect to Redis [${this.prefix}]`, error);
                super.emit('error' as never, error as never);
                throw error;
            }
        }
    }

    private parseKey(key: string): { collection: string; key: string } {
        const withoutPrefix = key.substring(this.prefix.length + 1);
        const colonIndex = withoutPrefix.indexOf(':');
        if (colonIndex === -1) {
            return { collection: '', key: withoutPrefix };
        }
        return {
            collection: withoutPrefix.substring(0, colonIndex),
            key: withoutPrefix.substring(colonIndex + 1)
        };
    }

    private formatKey(collection: string, key: string): string {
        return `${this.prefix}:${collection}:${key}`;
    }

    protected override validate<TCollection extends TCollections>(
        collection: TCollection,
        key: keyof TSchema[TCollection],
        value: unknown
    ): unknown {
        const collectionSchema = (this.schema as Record<string, Record<string, z.ZodTypeAny>>)[collection as string];
        const keySchema = collectionSchema?.[key as string];
        if (!keySchema) {
            if (value !== null && value !== undefined) {
                this.logger.logDebug(`[${this.prefix}] No schema for ${collection}.${String(key)}, returning value as-is`);
            }
            return value;
        }
        return keySchema.parse(value);
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
    ): Promise<any> {
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

        super.emit('get', { collection: collection as string, key: String(key), value: validated });
        this.logger.logDebug(`Get ${collection}.${String(key)}`, validated);
        return validated;
    }

    async has<TCollection extends TCollections>(
        collection: TCollection,
        key: keyof TSchema[TCollection]
    ): Promise<boolean> {
        await this.ensureConnected();

        const redisKey = this.formatKey(collection as string, String(key));
        const exists = await this.client.exists(redisKey);

        return exists === true;
    }

    async set<TCollection extends TCollections>(
        collection: TCollection,
        key: keyof TSchema[TCollection],
        value: any
    ): Promise<void> {
        await this.ensureConnected();

        const validated = this.validate(collection, key, value);
        const redisKey = this.formatKey(collection as string, String(key));
        const serialized = this.serialize(validated);

        this.logger.logDebug(`[${this.prefix}] Set ${collection}.${String(key)} -> ${redisKey}`);

        await this.client.set(redisKey, serialized);

        super.emit('set', { collection: collection as string, key: String(key), value: validated });
        this.logger.logDebug(`Set ${collection}.${String(key)}`, validated);
    }

    async delete<TCollection extends TCollections>(
        collection: TCollection,
        key: keyof TSchema[TCollection]
    ): Promise<boolean> {
        await this.ensureConnected();

        const redisKey = this.formatKey(collection as string, String(key));
        const result = await this.client.del(redisKey);

        const success = result === 1;
        super.emit('delete' as never, { collection: collection as string, key: String(key), success } as never);
        this.logger.logDebug(`Delete ${collection}.${String(key)}`, { success });
        return success;
    }

    async clear<TCollection extends TCollections>(
        collection?: TCollection
    ): Promise<void> {
        await this.ensureConnected();

        if (collection) {
            const pattern = `${this.prefix}:${collection as string}:*`;
            const keys = await this.client.send("KEYS", [pattern]) as string[];

            if (keys && keys.length > 0) {
                await this.client.send("DEL", keys);
            }

            super.emit('clear' as never, { collection: collection as string, count: keys?.length ?? 0 } as never);
            this.logger.logDebug(`Clear ${collection}`, { count: keys?.length ?? 0 });
        } else {
            const pattern = `${this.prefix}:*`;
            const keys = await this.client.send("KEYS", [pattern]) as string[];

            if (keys && keys.length > 0) {
                await this.client.send("DEL", keys);
            }

            super.emit('clear' as never, { collection: undefined, count: keys?.length ?? 0 } as never);
            this.logger.logDebug('Clear all collections', { count: keys?.length ?? 0 });
        }
    }

    async size<TCollection extends TCollections>(
        collection?: TCollection
    ): Promise<number> {
        await this.ensureConnected();

        if (collection) {
            const pattern = `${this.prefix}:${collection as string}:*`;
            const keys = await this.client.send("KEYS", [pattern]) as string[];
            return keys?.length ?? 0;
        } else {
            const pattern = `${this.prefix}:*`;
            const keys = await this.client.send("KEYS", [pattern]) as string[];
            return keys?.length ?? 0;
        }
    }

    async keys<TCollection extends TCollections>(
        collection: TCollection
    ): Promise<Array<keyof TSchema[TCollection]>> {
        await this.ensureConnected();

        const pattern = `${this.prefix}:${collection as string}:*`;
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
    }

    async close(): Promise<void> {
        this.client.close();
        this.connected = false;
        this.logger.logInfo('UserBucketManager: Closed');
    }
}
