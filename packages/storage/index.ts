import { DebugLogger } from "@paws/debug-logger";
import { z } from "zod";
import { BaseStorage } from "./adapters/base";
import { MemoryAdapter } from "./adapters/memory";
import { FileAdapter } from "./adapters/file";
import { RedisAdapter } from "./adapters/redis";
import { WebSocketAdapter } from "./adapters/websocket";
import type {
  CollectionSchema,
  StorageEvents,
  MemoryConfig,
  FileConfig,
  RedisConfig,
  WebSocketConfig,
  StorageConfig
} from "./types";

export function createStorage<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
>(
  type: 'memory',
  config: MemoryConfig,
  schema: TSchema,
  logger?: DebugLogger
): MemoryAdapter<TCollections, TSchema, TEvents>;

export function createStorage<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
>(
  type: 'file',
  config: FileConfig,
  schema: TSchema,
  logger?: DebugLogger
): FileAdapter<TCollections, TSchema, TEvents>;

export function createStorage<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
>(
  type: 'redis',
  config: RedisConfig,
  schema: TSchema,
  logger?: DebugLogger
): RedisAdapter<TCollections, TSchema, TEvents>;

export function createStorage<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
>(
  type: 'websocket',
  config: WebSocketConfig,
  schema: TSchema,
  logger?: DebugLogger
): WebSocketAdapter<TCollections, TSchema, TEvents>;

export function createStorage<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
>(
  type: string,
  config: StorageConfig,
  schema: TSchema,
  logger?: DebugLogger
): BaseStorage<TCollections, TSchema, TEvents> {
  switch (type) {
    case 'memory':
      return new MemoryAdapter(schema, config as MemoryConfig, logger) as any;
    case 'file':
      return new FileAdapter(schema, config as FileConfig, logger) as any;
    case 'redis':
      return new RedisAdapter(schema, config as RedisConfig, logger) as any;
    case 'websocket':
      return new WebSocketAdapter(schema, config as WebSocketConfig, logger) as any;
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

export { BaseStorage } from "./adapters/base";
export { MemoryAdapter } from "./adapters/memory";
export { FileAdapter } from "./adapters/file";
export { RedisAdapter } from "./adapters/redis";
export { WebSocketAdapter } from "./adapters/websocket";
export type {
  CollectionSchema,
  StorageEvents,
  StorageEventKind,
  BaseStorageEvents,
  OperationEvents,
  MemoryConfig,
  FileConfig,
  RedisConfig,
  WebSocketConfig,
  StorageConfig
} from "./types";

