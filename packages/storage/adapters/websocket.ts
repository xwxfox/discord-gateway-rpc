import { z } from "zod";
import { BaseStorage } from "./base";
import type { CollectionSchema, WebSocketConfig, StorageEvents } from "../types";
import crypto from "node:crypto";

const ServerHelloSchema = z.object({
  type: z.literal("hello"),
  channelId: z.string(),
});

const ServerEncryptionSchema = z.object({
  type: z.literal("encryption"),
  encryptionKey: z.string(),
  iv: z.string(),
});

const ServerEventSchema = z.object({
  type: z.literal("event"),
  event: z.enum(["set", "delete", "clear"]),
  collection: z.string(),
  key: z.string().optional(),
  value: z.unknown().optional(),
});

const ServerErrorSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
});

const ResponseSchema = z.object({
  id: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

type ClientMessage =
  | { action: "get"; collection: string; key: string; id: string }
  | { action: "set"; collection: string; key: string; value: unknown; id: string }
  | { action: "delete"; collection: string; key: string; id: string }
  | { action: "clear"; collection?: string; id: string }
  | { action: "size"; collection?: string; id: string }
  | { action: "keys"; collection: string; id: string };

type ServerMessage =
  | z.infer<typeof ServerHelloSchema>
  | z.infer<typeof ServerEncryptionSchema>
  | z.infer<typeof ServerEventSchema>
  | z.infer<typeof ServerErrorSchema>
  | z.infer<typeof ResponseSchema>;

type EncryptionData = {
  encryptionKey: Buffer;
  iv: Buffer;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class WebSocketAdapter<
  TCollections extends string,
  TSchema extends CollectionSchema<TCollections>,
  TEvents extends StorageEvents = StorageEvents
> extends BaseStorage<TCollections, TSchema, TEvents> {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private authenticated: boolean = false;
  private closing: boolean = false;
  private config: Required<WebSocketConfig>;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private encryptionData: EncryptionData | null = null;

  constructor(
    schema: TSchema,
    config: WebSocketConfig,
    logger?: import("@paws/debug-logger").DebugLogger
  ) {
    super(schema, logger);
    this.config = {
      url: config.url,
      token: config.token ?? "",
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    };

    if (!this.config.token) {
      throw new Error("Token is required for WebSocket adapter");
    }

    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.closing = false;

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.sendHello();
        this.logger.logInfo("WebSocket connection established");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = event.data.toString();
          this.handleMessage(data);
        } catch (error) {
          this.logger.logError("Failed to parse WebSocket message", error);
          super.emit("error" as never, error as never);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.authenticated = false;
        this.encryptionData = null;
        super.emit("disconnected" as never, undefined as never);
        this.logger.logInfo("WebSocket connection closed");

        if (!this.closing) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.logger.logError("WebSocket connection error", error);
        super.emit("error" as never, error as never);
      };
    } catch (error) {
      this.logger.logError("Failed to create WebSocket connection", error);
      super.emit("error" as never, error as never);

      if (!this.closing) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.config.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.logError("Max reconnect attempts reached");
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.logger.logInfo(`Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, this.config.reconnectInterval);
  }

  private async waitForConnection(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.connected) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  private async waitForAuthentication(): Promise<void> {
    if (this.authenticated) {
      return;
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.authenticated) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  private sendHello(): void {
    if (!this.ws) {
      return;
    }

    const helloMessage = JSON.stringify({
      type: "hello",
      token: this.config.token,
    });

    this.ws.send(helloMessage);
  }

  private deriveEncryptionSecret(): Buffer {
    return crypto.pbkdf2Sync(this.config.token, "ws_encryption_salt", 100000, 32, "sha256");
  }

  private decryptSessionData(encryptedKey: string): { encryptionKey: Buffer; iv: Buffer } {
    const secret = this.deriveEncryptionSecret();
    const combined = Buffer.from(encryptedKey, "base64");

    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", secret, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    const sessionKey = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return { encryptionKey: sessionKey, iv };
  }

  private encrypt(data: unknown): string {
    if (!this.encryptionData) {
      return JSON.stringify(data);
    }

    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionData.encryptionKey, this.encryptionData.iv, { authTagLength: 16 });
    const json = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([this.encryptionData.iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  private decrypt<T>(encrypted: string): T {
    if (!this.encryptionData) {
      return JSON.parse(encrypted) as T;
    }

    const combined = Buffer.from(encrypted, "base64");
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const ciphertext = combined.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionData.encryptionKey, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  }

  private handleMessage(data: string): void {
    let parsed: ServerMessage;

    try {
      if (this.encryptionData) {
        parsed = this.decrypt<ServerMessage>(data);
      } else {
        parsed = JSON.parse(data);
      }
    } catch (error) {
      this.logger.logError("Failed to parse message", error);
      return;
    }

    const helloResult = ServerHelloSchema.safeParse(parsed);
    if (helloResult.success) {
      this.logger.logInfo("Server hello received - joined channel:", helloResult.data.channelId);
      return;
    }

    const encryptionResult = ServerEncryptionSchema.safeParse(parsed);
    if (encryptionResult.success) {
      try {
        this.encryptionData = this.decryptSessionData(encryptionResult.data.encryptionKey);

        this.authenticated = true;
        super.emit("connected" as never, undefined as never);
        this.logger.logInfo("Authentication and encryption established");
      } catch (error) {
        this.logger.logError("Failed to decrypt encryption data", error);
        super.emit("error" as never, error as never);
      }
      return;
    }

    const eventResult = ServerEventSchema.safeParse(parsed);
    if (eventResult.success) {
      const eventData = eventResult.data;
      super.emit("remote", { type: eventData.event, collection: eventData.collection, key: eventData.key, value: eventData.value });
      this.logger.logDebug(`Remote event: ${eventData.event}`, eventData);
      return;
    }

    const errorResult = ServerErrorSchema.safeParse(parsed);
    if (errorResult.success) {
      this.logger.logError("Server error", errorResult.data.error);
      super.emit("error", new Error(errorResult.data.error));
      return;
    }

    const responseResult = ResponseSchema.safeParse(parsed);
    if (responseResult.success) {
      const handler = this.pendingRequests.get(responseResult.data.id);
      if (handler) {
        if (responseResult.data.error) {
          handler.reject(new Error(responseResult.data.error));
        } else {
          handler.resolve(responseResult.data.result);
        }
        this.pendingRequests.delete(responseResult.data.id);
      }
      return;
    }

    this.logger.logError("Unknown message type", parsed);
  }

  private async sendRequest<T = unknown>(message: ClientMessage): Promise<T> {
    await this.waitForConnection();
    await this.waitForAuthentication();

    if (!this.ws) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error("WebSocket request timeout"));
      }, 5000);

      this.pendingRequests.set(message.id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error as Error);
        },
      });

      const encrypted = this.encrypt(message);
      this.ws!.send(encrypted);
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(7);
  }

  async get<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<z.infer<TSchema[TCollection][typeof key]> | null> {
    try {
      const result = await this.sendRequest<{ collection: string; key: string; value: unknown | null }>({
        action: "get",
        collection: collection as string,
        key: String(key),
        id: this.generateId(),
      });

      const validated = result.value !== null ? this.validate(collection, key, result.value) : null;

      super.emit("get" as never, { collection: collection as string, key: String(key), value: validated } as never);
      this.logger.logDebug(`Get ${collection}.${String(key)}`, validated);
      return validated as z.infer<TSchema[TCollection][typeof key]> | null;
    } catch (error) {
      this.logger.logError(`Failed to get ${collection}.${String(key)}`, error);
      super.emit("error" as never, error as never);
      throw error;
    }
  }

  async has<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    try {
      const result = await this.sendRequest<{ value: unknown | null }>({
        action: "get",
        collection: collection as string,
        key: String(key),
        id: this.generateId(),
      });
      return result.value !== null;
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
    const validated = this.validate(collection, key, value);

    try {
      await this.sendRequest({
        action: "set",
        collection: collection as string,
        key: String(key),
        value: validated,
        id: this.generateId(),
      });

      super.emit("set" as never, { collection: collection as string, key: String(key), value: validated } as never);
      this.logger.logDebug(`Set ${collection}.${String(key)}`, validated);
    } catch (error) {
      this.logger.logError(`Failed to set ${collection}.${String(key)}`, error);
      super.emit("error" as never, error as never);
      throw error;
    }
  }

  async delete<TCollection extends TCollections>(
    collection: TCollection,
    key: keyof TSchema[TCollection]
  ): Promise<boolean> {
    try {
      const result = await this.sendRequest<{ success: boolean }>({
        action: "delete",
        collection: collection as string,
        key: String(key),
        id: this.generateId(),
      });

      const success = result.success ?? false;
      super.emit("delete" as never, { collection: collection as string, key: String(key), success } as never);
      this.logger.logDebug(`Delete ${collection}.${String(key)}`, { success });
      return success;
    } catch (error) {
      this.logger.logError(`Failed to delete ${collection}.${String(key)}`, error);
      super.emit("error" as never, error as never);
      throw error;
    }
  }

  async clear<TCollection extends TCollections>(collection?: TCollection): Promise<void> {
    try {
      const result = await this.sendRequest<{ count: number }>({
        action: "clear",
        collection: collection ? String(collection) : undefined,
        id: this.generateId(),
      });

      const count = result.count ?? 0;
      super.emit("clear" as never, { collection: collection ? String(collection) : undefined, count } as never);
      this.logger.logDebug(`Clear ${collection ?? "all"}`, { count });
    } catch (error) {
      this.logger.logError("Failed to clear storage", error);
      super.emit("error" as never, error as never);
      throw error;
    }
  }

  async size<TCollection extends TCollections>(collection?: TCollection): Promise<number> {
    try {
      const result = await this.sendRequest<{ size: number }>({
        action: "size",
        collection: collection ? String(collection) : undefined,
        id: this.generateId(),
      });

      return result.size ?? 0;
    } catch (error) {
      this.logger.logError("Failed to get storage size", error);
      return 0;
    }
  }

  async keys<TCollection extends TCollections>(collection: TCollection): Promise<Array<keyof TSchema[TCollection]>> {
    try {
      const result = await this.sendRequest<{ keys: string[] }>({
        action: "keys",
        collection: String(collection),
        id: this.generateId(),
      });

      return (result.keys ?? []) as Array<keyof TSchema[TCollection]>;
    } catch (error) {
      this.logger.logError(`Failed to get keys for collection ${collection}`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    this.closing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.authenticated = false;
      this.pendingRequests.clear();
      this.removeAllListeners();
    }
  }
}
