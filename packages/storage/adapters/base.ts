import { DebugLogger } from "@paws/debug-logger";
import { EventEmitter } from "@paws/event-emitter";
import { z } from "zod";
import type { CollectionSchema, StorageEvents } from "../types";

export abstract class BaseStorage<
  TCollections extends string = string,
  TSchema extends CollectionSchema<TCollections> = CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
> extends EventEmitter<TEvents> {
  protected logger: DebugLogger;
  protected schema: TSchema;

  constructor(schema: TSchema, logger?: DebugLogger) {
    super();
    this.schema = schema;
    this.logger = logger ?? new DebugLogger();
  }

  protected validate<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection],
    value: unknown
  ): unknown {
    const schema = this.schema[collection]?.[key as string];
    if (!schema) {
      return value;
    }
    return schema.parse(value);
  }

  abstract get<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<z.infer<TSchema[TCollection][typeof key]> | null>;

  abstract has<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean>;

  abstract set<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection],
    value: z.input<TSchema[TCollection][typeof key]>
  ): Promise<void>;

  abstract delete<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean>;

  abstract clear<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<void>;

  abstract size<TCollection extends TCollections>(
    collection?: TCollection
  ): Promise<number>;

  abstract keys<TCollection extends TCollections>(
    collection: TCollection
  ): Promise<Array<keyof TSchema[TCollection]>>;

  abstract close(): Promise<void>;
}
