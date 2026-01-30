import type { DebugLogger } from '@paws/debug-logger';
import { z } from 'zod';

export type CollectionSchema<TCollections extends string> = {
  [K in TCollections]: Record<string, z.ZodTypeAny>
}

export type StorageEventKind = 'get' | 'set' | 'delete' | 'clear';

export interface BaseStorageEvents {
  connected?: void;
  disconnected?: void;
  error: Error;
  remote: { type: StorageEventKind, collection: string, key: string | undefined, value: unknown | null }
}

export interface OperationEvents {
  get: { collection: string; key: string; value: unknown | null };
  set: { collection: string; key: string; value: unknown };
  delete: { collection: string; key: string; success: boolean };
  clear: { collection?: string; count: number };
}

export type StorageEvents<TOperationEvents extends OperationEvents = OperationEvents> =
  BaseStorageEvents & TOperationEvents

export interface MemoryConfig {
  initialData?: Record<string, Record<string, unknown>>;
}

export interface FileConfig {
  basePath: string;
  autoCreateDirs?: boolean;
  encoding?: BufferEncoding;
}

export interface RedisConfig {
  url?: string;
  database?: number;
}

export interface WebSocketConfig {
  url: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketServerStorageConfig {
  url: string;
  database?: number;
}

export interface WebSocketServerConfig {
  port?: number;
  validateToken?: (token: string) => Promise<boolean>;
  logger?: DebugLogger;
  storage?: WebSocketServerStorageConfig;
}

export const UserBucketMetadataSchema = z.object({
  userId: z.string(),
  createdAt: z.number(),
  lastAccessedAt: z.number(),
  isActive: z.boolean(),
});

export type UserBucketMetadata = z.infer<typeof UserBucketMetadataSchema>;

export type StorageConfig = MemoryConfig | FileConfig | RedisConfig | WebSocketConfig;

export type StorageType = 'memory' | 'file' | 'redis' | 'websocket';
