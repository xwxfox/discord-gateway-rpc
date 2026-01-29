import { z } from "zod";
import { BaseStorage } from "./base";
import type { CollectionSchema, MemoryConfig, StorageEvents } from "../types";

export class MemoryAdapter<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
> extends BaseStorage<TCollections, TSchema, TEvents> {
  private data: Map<TCollections, Map<string, unknown>>;

  constructor(schema: TSchema, config: MemoryConfig = {}, logger?: import("@paws/debug-logger").DebugLogger) {
    super(schema, logger);
    this.data = new Map();
    if (config.initialData) {
      for (const [collection, items] of Object.entries(config.initialData)) {
        const collectionMap = new Map(Object.entries(items));
        this.data.set(collection as TCollections, collectionMap as Map<string, unknown>);
      }
    }
  }

  async get<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<z.infer<TSchema[TCollection][typeof key]> | null> {
    const collectionMap = this.data.get(collection);
    const value = collectionMap?.get(String(key)) ?? null;
    super.emit('get' as never, { collection: collection as string, key: String(key), value } as never);
    this.logger.logDebug(`Get ${collection}.${String(key)}`, value);
    return value as z.infer<TSchema[TCollection][typeof key]> | null;
  }

  async has<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    const collectionMap = this.data.get(collection);
    return collectionMap?.has(String(key)) ?? false;
  }

  async set<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection],
    value: z.input<TSchema[TCollection][typeof key]>
  ): Promise<void> {
    const validated = this.validate(collection, key, value);
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    this.data.get(collection)!.set(String(key), validated);
    super.emit('set' as never, { collection: collection as string, key: String(key), value: validated } as never);
    this.logger.logDebug(`Set ${collection}.${String(key)}`, validated);
  }

  async delete<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    const collectionMap = this.data.get(collection);
    const success = collectionMap?.delete(String(key)) ?? false;
    super.emit('delete' as never, { collection: collection as string, key: String(key), success } as never);
    this.logger.logDebug(`Delete ${collection}.${String(key)}`, { success });
    return success;
  }

  async clear<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<void> {
    if (collection) {
      const collectionMap = this.data.get(collection);
      const count = collectionMap?.size ?? 0;
      collectionMap?.clear();
      this.data.delete(collection);
      super.emit('clear' as never, { collection: collection as string, count } as never);
    } else {
      let count = 0;
      for (const map of this.data.values()) {
        count += map.size;
      }
      this.data.clear();
      super.emit('clear' as never, { collection: undefined, count } as never);
    }
    this.logger.logDebug(`Clear ${collection ?? 'all'}`);
  }

  async size<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<number> {
    if (collection) {
      return this.data.get(collection)?.size ?? 0;
    }
    let total = 0;
    for (const map of this.data.values()) {
      total += map.size;
    }
    return total;
  }

  async keys<TCollection extends TCollections>(
    collection: TCollection
  ): Promise<Array<keyof TSchema[TCollection]>> {
    const collectionMap = this.data.get(collection);
    return Array.from(collectionMap?.keys() ?? []) as Array<keyof TSchema[TCollection]>;
  }

  async close(): Promise<void> {
    this.data.clear();
    this.removeAllListeners();
  }
}
