import { mkdirSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { z } from "zod";
import { BaseStorage } from "./base";
import type { CollectionSchema, FileConfig, StorageEvents } from "../types";

export class FileAdapter<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
> extends BaseStorage<TCollections, TSchema, TEvents> {
  private basePath: string;
  private autoCreateDirs: boolean;
  private encoding: BufferEncoding;

  constructor(
    schema: TSchema,
    config: FileConfig,
    logger?: import("@paws/debug-logger").DebugLogger
  ) {
    super(schema, logger);
    this.basePath = config.basePath;
    this.autoCreateDirs = config.autoCreateDirs ?? true;
    this.encoding = config.encoding ?? 'utf-8';
    this.ensureBasePath();
  }

  private getFilePath(collection: string, key: string): string {
    return `${this.basePath}/${collection}/${key}.json`;
  }

  private ensureBasePath(): void {
    try {
      if (this.autoCreateDirs) {
        mkdirSync(this.basePath, { recursive: true });
      }
    } catch (error) {
      this.logger.logError(`Failed to create base path: ${this.basePath}`, error);
      throw error;
    }
  }

  private ensureCollectionPath(collection: string): void {
    try {
      if (this.autoCreateDirs) {
        const collectionPath = `${this.basePath}/${collection}`;
        mkdirSync(collectionPath, { recursive: true });
      }
    } catch (error) {
      this.logger.logError(`Failed to create collection path: ${collection}`, error);
      throw error;
    }
  }

  async get<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<z.infer<TSchema[TCollection][typeof key]> | null> {
    const filePath = this.getFilePath(collection as string, String(key));
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        super.emit('get' as never, { collection: collection as string, key: String(key), value: null } as never);
        this.logger.logDebug(`Get ${collection}.${String(key)} - file not found`);
        return null;
      }
      const content = await file.text();
      const value = JSON.parse(content);
      const validated = this.validate(collection, key, value);
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
    const filePath = this.getFilePath(collection as string, String(key));
    try {
      const file = Bun.file(filePath);
      return await file.exists();
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
      const validated = this.validate(collection, key, value);
      this.ensureCollectionPath(collection as string);
      const filePath = this.getFilePath(collection as string, String(key));
      await Bun.write(filePath, JSON.stringify(validated, null, 2));
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
    const filePath = this.getFilePath(collection as string, String(key));
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        super.emit('delete' as never, { collection: collection as string, key: String(key), success: false } as never);
        this.logger.logDebug(`Delete ${collection}.${String(key)} - file not found`);
        return false;
      }
      unlinkSync(filePath);
      super.emit('delete' as never, { collection: collection as string, key: String(key), success: true } as never);
      this.logger.logDebug(`Delete ${collection}.${String(key)}`, { success: true });
      return true;
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
      if (collection) {
        const collectionPath = `${this.basePath}/${collection}`;
        let count = 0;
        try {
          const files = readdirSync(collectionPath);
          for (const file of files) {
            const filePath = `${collectionPath}/${file}`;
            try {
              unlinkSync(filePath);
              count++;
            } catch {
            }
          }
          try {
            rmdirSync(collectionPath);
          } catch {
          }
        } catch {
        }
        super.emit('clear' as never, { collection: collection as string, count } as never);
        this.logger.logDebug(`Clear ${collection}`);
      } else {
        let count = 0;
        try {
          const collections = readdirSync(this.basePath);
          for (const collectionDir of collections) {
            const collectionPath = `${this.basePath}/${collectionDir}`;
            try {
              const files = readdirSync(collectionPath);
              for (const file of files) {
                const filePath = `${collectionPath}/${file}`;
                try {
                  unlinkSync(filePath);
                  count++;
                } catch {
                }
              }
              try {
                rmdirSync(collectionPath);
              } catch {
              }
            } catch {
            }
          }
        } catch {
        }
        super.emit('clear' as never, { collection: undefined, count } as never);
        this.logger.logDebug('Clear all collections');
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
      if (collection) {
        const collectionPath = `${this.basePath}/${collection}`;
        try {
          const files = readdirSync(collectionPath);
          return files.filter(f => f.endsWith('.json')).length;
        } catch {
          return 0;
        }
      } else {
        const dir = Bun.file(this.basePath);
        if (!await dir.exists()) {
          return 0;
        }
        let count = 0;
        try {
          const collections = readdirSync(this.basePath);
          for (const collectionDir of collections) {
            const collectionPath = `${this.basePath}/${collectionDir}`;
            try {
              const files = readdirSync(collectionPath);
              count += files.filter(f => f.endsWith('.json')).length;
            } catch {
            }
          }
        } catch {
        }
        return count;
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
      const collectionPath = `${this.basePath}/${collection}`;
      try {
        const files = readdirSync(collectionPath);
        return files
          .filter(f => f.endsWith('.json'))
          .map(f => f.replace('.json', '')) as Array<keyof TSchema[TCollection]>;
      } catch {
        return [];
      }
    } catch (error) {
      this.logger.logError(`Failed to get keys for collection ${collection}`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    this.removeAllListeners();
  }
}
