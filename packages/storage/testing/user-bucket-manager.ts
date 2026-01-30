import { RedisClient } from "bun";
import { z } from "zod";
import { BaseStorage } from "../adapters/base";
import type { CollectionSchema, RedisConfig, UserBucketMetadata, StorageEvents } from "../types";
import type { DebugLogger } from "@paws/debug-logger";
import { UserRedisAdapter } from "./server-redis";

const UserBucketMetadataSchema = z.object({
  userId: z.string(),
  createdAt: z.number(),
  lastAccessedAt: z.number(),
  isActive: z.boolean(),
});

const USER_METADATA_KEY_PREFIX = "user_metadata:";
const USER_DATA_KEY_PREFIX = "user_data:";
const ALL_USERS_SET_KEY = "all_users";

export class UserBucketManager<TCollections extends string = string, TSchema extends CollectionSchema<TCollections> = CollectionSchema<TCollections>> {
  private client: RedisClient;
  private connected: boolean = false;
  private config: Required<RedisConfig>;
  private logger: DebugLogger;
  private buckets: Map<string, BaseStorage<TCollections, TSchema>> = new Map();
  private metadataCache: Map<string, UserBucketMetadata> = new Map();
  private schema: TSchema;

  constructor(config: Required<RedisConfig>, schema: TSchema, logger: DebugLogger, sharedClient?: RedisClient) {
    this.config = config;
    this.schema = schema;
    this.logger = logger;

    if (sharedClient) {
      this.client = sharedClient;
    } else {
      const url = new URL(this.config.url);
      
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
    this.client.onconnect = () => {
      this.connected = true;
      this.logger.logInfo('UserBucketManager: Redis connection established');
    };

    this.client.onclose = (error) => {
      this.connected = false;
      if (error) {
        this.logger.logError('UserBucketManager: Redis connection closed', error);
      } else {
        this.logger.logInfo('UserBucketManager: Redis connection closed');
      }
    };
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      try {
        this.logger.logDebug(`UserBucketManager: Connecting to Redis at ${this.config.url}...`);
        await this.client.connect();
        this.logger.logDebug("UserBucketManager: Redis client connected");
      } catch (error) {
        this.logger.logError('UserBucketManager: Failed to connect to Redis', error);
        throw error;
      }
    }
  }

  private formatUserId(token: string): string {
    const hash = Bun.hash(token);
    return `user_${hash}`;
  }

  private formatUserMetadataKey(userId: string): string {
    return `${USER_METADATA_KEY_PREFIX}${userId}`;
  }

  private formatUserDataPrefix(userId: string): string {
    return `${USER_DATA_KEY_PREFIX}${userId}`;
  }

  async initialize(): Promise<void> {
    this.logger.logDebug("UserBucketManager: Starting initialization...");
    await this.ensureConnected();
    this.logger.logDebug("UserBucketManager: Connected to Redis");
    await this.loadAllMetadata();
    this.logger.logInfo(`UserBucketManager: Loaded ${this.metadataCache.size} user buckets`);
  }

  private async loadAllMetadata(): Promise<void> {
    try {
      const userIds = await this.client.send("SMEMBERS", [ALL_USERS_SET_KEY]) as string[];

      if (!userIds || userIds.length === 0) {
        return;
      }

      for (const userId of userIds) {
        const metadataKey = this.formatUserMetadataKey(userId);
        const metadataJson = await this.client.get(metadataKey);

        if (metadataJson) {
          try {
            const parsed = JSON.parse(metadataJson);
            const validated = UserBucketMetadataSchema.parse(parsed);
            this.metadataCache.set(userId, validated);
          } catch (error) {
            this.logger.logError(`UserBucketManager: Failed to parse metadata for ${userId}`, error);
          }
        }
      }
    } catch (error) {
      this.logger.logError('UserBucketManager: Failed to load user metadata', error);
      throw error;
    }
  }

  async getUserBucket(token: string): Promise<BaseStorage<TCollections, TSchema> | null> {
    await this.ensureConnected();

    const userId = this.formatUserId(token);

    if (this.buckets.has(userId)) {
      const bucket = this.buckets.get(userId)!;
      await this.updateLastAccessed(userId);
      return bucket;
    }

    const metadata = this.metadataCache.get(userId);

    if (!metadata) {
      return null;
    }

    const bucket = this.createBucketForUser(userId);
    this.buckets.set(userId, bucket);
    await this.updateLastAccessed(userId);

    return bucket;
  }

  async ensureUserBucket(token: string): Promise<BaseStorage<TCollections, TSchema>> {
    await this.ensureConnected();

    const userId = this.formatUserId(token);

    if (this.buckets.has(userId)) {
      const bucket = this.buckets.get(userId)!;
      await this.updateLastAccessed(userId);
      return bucket;
    }

    const metadata = this.metadataCache.get(userId);

    if (!metadata) {
      await this.createUserMetadata(userId);
    }

    const bucket = this.createBucketForUser(userId);
    this.buckets.set(userId, bucket);
    await this.updateLastAccessed(userId);

    return bucket;
  }

  private async createUserMetadata(userId: string): Promise<void> {
    const now = Date.now();
    const metadata: UserBucketMetadata = {
      userId,
      createdAt: now,
      lastAccessedAt: now,
      isActive: true,
    };

    const metadataKey = this.formatUserMetadataKey(userId);
    const metadataJson = JSON.stringify(metadata);

    await this.client.set(metadataKey, metadataJson);
    await this.client.send("SADD", [ALL_USERS_SET_KEY, userId]);

    this.metadataCache.set(userId, metadata);
    this.logger.logDebug(`UserBucketManager: Created user bucket ${userId}`);
  }

  private async updateLastAccessed(userId: string): Promise<void> {
    const metadata = this.metadataCache.get(userId);

    if (!metadata) {
      return;
    }

    const updatedMetadata: UserBucketMetadata = {
      ...metadata,
      lastAccessedAt: Date.now(),
      isActive: true,
    };

    const metadataKey = this.formatUserMetadataKey(userId);
    const metadataJson = JSON.stringify(updatedMetadata);

    await this.client.set(metadataKey, metadataJson);
    this.metadataCache.set(userId, updatedMetadata);
  }

  private createBucketForUser(userId: string): BaseStorage<TCollections, TSchema> {
    const userDataPrefix = this.formatUserDataPrefix(userId);

    return new UserRedisAdapter<TCollections, TSchema, StorageEvents>(
      this.schema,
      this.config,
      userDataPrefix,
      this.logger,
      this.client
    );
  }

  async deleteUserBucket(userId: string): Promise<boolean> {
    await this.ensureConnected();

    if (!this.metadataCache.has(userId)) {
      return false;
    }

    const bucket = this.buckets.get(userId);
    if (bucket) {
      await bucket.clear();
      this.buckets.delete(userId);
    }

    const metadataKey = this.formatUserMetadataKey(userId);
    await this.client.del(metadataKey);
    await this.client.send("SREM", [ALL_USERS_SET_KEY, userId]);

    this.metadataCache.delete(userId);
    this.logger.logDebug(`UserBucketManager: Deleted user bucket ${userId}`);

    return true;
  }

  async deleteUserBucketByToken(token: string): Promise<boolean> {
    const userId = this.formatUserId(token);
    return await this.deleteUserBucket(userId);
  }

  getAllUserIds(): string[] {
    return Array.from(this.metadataCache.keys());
  }

  async getUserMetadata(userId: string): Promise<UserBucketMetadata | null> {
    return this.metadataCache.get(userId) ?? null;
  }

  async getUserMetadataByToken(token: string): Promise<UserBucketMetadata | null> {
    const userId = this.formatUserId(token);
    return await this.getUserMetadata(userId);
  }

  async close(): Promise<void> {
    for (const bucket of this.buckets.values()) {
      await bucket.close();
    }
    this.buckets.clear();
    this.metadataCache.clear();
    this.client.close();
    this.connected = false;
    this.logger.logInfo('UserBucketManager: Closed');
  }
}
