import type { ServerWebSocket } from "bun";
import { z } from "zod";
import type { WebSocketServerConfig } from "../types";
import type { BaseStorage } from "../adapters/base";
import crypto from "node:crypto";
import { DebugLogger } from "@paws/debug-logger";
import { UserBucketManager } from './user-bucket-manager';

const ClientHelloSchema = z.object({
  type: z.literal("hello"),
  token: z.string(),
});

const ClientMessageSchemas = {
  get: z.object({
    action: z.literal("get"),
    collection: z.string(),
    key: z.string(),
    id: z.string(),
  }),
  set: z.object({
    action: z.literal("set"),
    collection: z.string(),
    key: z.string(),
    value: z.unknown(),
    id: z.string(),
  }),
  delete: z.object({
    action: z.literal("delete"),
    collection: z.string(),
    key: z.string(),
    id: z.string(),
  }),
  clear: z.object({
    action: z.literal("clear"),
    collection: z.string().optional(),
    id: z.string(),
  }),
  size: z.object({
    action: z.literal("size"),
    collection: z.string().optional(),
    id: z.string(),
  }),
  keys: z.object({
    action: z.literal("keys"),
    collection: z.string(),
    id: z.string(),
  }),
  adminListUsers: z.object({
    action: z.literal("admin_list_users"),
    id: z.string(),
  }),
  adminDeleteUser: z.object({
    action: z.literal("admin_delete_user"),
    id: z.string(),
    userId: z.string(),
  }),
  adminUserInfo: z.object({
    action: z.literal("admin_user_info"),
    id: z.string(),
    userId: z.string(),
  }),
} as const;

type ClientMessageAction = z.infer<typeof ClientMessageSchemas.get>["action"] |
  z.infer<typeof ClientMessageSchemas.set>["action"] |
  z.infer<typeof ClientMessageSchemas.delete>["action"] |
  z.infer<typeof ClientMessageSchemas.clear>["action"] |
  z.infer<typeof ClientMessageSchemas.size>["action"] |
  z.infer<typeof ClientMessageSchemas.keys>["action"] |
  z.infer<typeof ClientMessageSchemas.adminListUsers>["action"] |
  z.infer<typeof ClientMessageSchemas.adminDeleteUser>["action"] |
  z.infer<typeof ClientMessageSchemas.adminUserInfo>["action"];

const ServerEventSchemas = {
  connected: z.object({
    type: z.literal("connected"),
  }),
  disconnected: z.object({
    type: z.literal("disconnected"),
    reason: z.string().optional(),
  }),
  event: z.object({
    type: z.literal("event"),
    event: z.enum(["set", "delete", "clear"]),
    collection: z.string(),
    key: z.string().optional(),
    value: z.unknown().optional(),
  }),
  hello: z.object({
    type: z.literal("hello"),
    channelId: z.string(),
  }),
  error: z.object({
    type: z.literal("error"),
    error: z.string(),
  }),
} as const;

type ClientMessage = z.infer<(typeof ClientMessageSchemas)[keyof typeof ClientMessageSchemas]>;

type ServerEvent = z.infer<(typeof ServerEventSchemas)[keyof typeof ServerEventSchemas]>;

type Response<T = unknown> = {
  id: string;

  result?: T;
  error?: string;
};

interface Client {
  ws: ServerWebSocket<any>;
  token: string;
  channelId: string;
  encryptionKey?: Buffer;
  iv?: Buffer;
  isAuthenticated: boolean;
  storage?: BaseStorage;
}


export class WebSocketStorageServer {
  private userBucketManager: UserBucketManager;
  private clients: Set<Client> = new Set();
  private clientsByChannel: Map<string, Set<Client>> = new Map();
  private validateToken: (token: string) => Promise<boolean>;
  private port: number;
  private logger: DebugLogger;
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor(config: WebSocketServerConfig = {}) {
    this.validateToken = config.validateToken ?? (async () => true);
    this.port = config.port ?? 3000;
    this.logger = config.logger ? config.logger : new DebugLogger();

    const storageConfig = config.storage ?? {
      url: "redis://default:changeme@localhost:6769",
      database: 0,
    };

    const schema: Record<string, Record<string, z.ZodTypeAny>> = {};

    this.userBucketManager = new UserBucketManager(
      {
        url: storageConfig.url,
        database: storageConfig.database ?? 0,
      },
      schema,
      this.logger
    );
  }

  async initialize(): Promise<void> {
    this.logger.logInfo("Initializing UserBucketManager...");
    await this.userBucketManager.initialize();
    this.logger.logInfo("UserBucketManager initialized successfully");
  }

  private deriveChannelId(token: string): string {
    const hash = crypto
      .createHash("sha256")
      .update(token + "_ws_channel_salt_v1")
      .digest("hex");
    return `channel_${hash.substring(0, 16)}`;
  }

  private deriveEncryptionSecret(token: string): Buffer {
    return crypto.pbkdf2Sync(token, "ws_encryption_salt", 100000, 32, "sha256");
  }

  private encryptSessionKey(sessionKey: Buffer, token: string): string {
    const secret = this.deriveEncryptionSecret(token);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv, { authTagLength: 16 });

    const encrypted = Buffer.concat([cipher.update(sessionKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  private encrypt(data: unknown, client: Client): string {
    if (!client.encryptionKey || !client.iv) {
      return JSON.stringify(data);
    }

    const cipher = crypto.createCipheriv("aes-256-gcm", client.encryptionKey, client.iv, { authTagLength: 16 });
    const json = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([client.iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  private decrypt<T>(encrypted: string, client: Client): T {
    if (!client.encryptionKey) {
      return JSON.parse(encrypted) as T;
    }

    const combined = Buffer.from(encrypted, "base64");
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const ciphertext = combined.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", client.encryptionKey, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  }

  private validateClientMessage(data: unknown): ClientMessage {
    const schemas = [
      ClientMessageSchemas.get,
      ClientMessageSchemas.set,
      ClientMessageSchemas.delete,
      ClientMessageSchemas.clear,
      ClientMessageSchemas.size,
      ClientMessageSchemas.keys,
      ClientMessageSchemas.adminListUsers,
      ClientMessageSchemas.adminDeleteUser,
      ClientMessageSchemas.adminUserInfo,
    ];

    for (const schema of schemas) {
      const validated = schema.safeParse(data);
      if (validated.success) {
        return validated.data;
      }
    }

    throw new Error(`Invalid message: could not match any valid schema`);
  }

  private send(ws: ServerWebSocket, response: Response, client: Client): void {
    if (client.isAuthenticated && client.encryptionKey) {
      const encrypted = this.encrypt(response, client);
      ws.send(encrypted);
    } else {
      ws.send(JSON.stringify(response));
    }
  }

  private sendEvent(ws: ServerWebSocket<any>, event: ServerEvent): void {
    ws.send(JSON.stringify(event));
  }

  private broadcastToChannel(channelId: string, event: ServerEvent, excludeClient?: Client): void {
    const channelClients = this.clientsByChannel.get(channelId);
    if (!channelClients) {
      return;
    }

    for (const client of channelClients) {
      if (client === excludeClient) {
        continue;
      }

      try {
        if (client.isAuthenticated) {
          const encrypted = this.encrypt(event, client);
          client.ws.send(encrypted);
        } else {
          this.sendEvent(client.ws, event);
        }
      } catch (e) {
        console.error("Failed to send event to client:", e);
      }
    }
  }

  private async handleGet(message: z.infer<typeof ClientMessageSchemas.get>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      const value = await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).get(
        message.collection,
        message.key
      );

      this.send(client.ws, {
        id: message.id,
        result: { collection: message.collection, key: message.key, value },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleSet(message: z.infer<typeof ClientMessageSchemas.set>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).set(
        message.collection,
        message.key,
        message.value
      );

      this.send(client.ws, {
        id: message.id,
        result: { collection: message.collection, key: message.key },
      }, client);

      this.broadcastToChannel(
        client.channelId,
        {
          type: "event",
          event: "set",
          collection: message.collection,
          key: message.key,
          value: message.value,
        },
        client
      );
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleDelete(message: z.infer<typeof ClientMessageSchemas.delete>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      const success = await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).delete(
        message.collection,
        message.key
      );

      this.send(client.ws, {
        id: message.id,
        result: { success },
      }, client);

      if (success) {
        this.broadcastToChannel(
          client.channelId,
          {
            type: "event",
            event: "delete",
            collection: message.collection,
            key: message.key,
          },
          client
        );
      }
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleClear(message: z.infer<typeof ClientMessageSchemas.clear>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).clear(
        message.collection
      );

      this.send(client.ws, {
        id: message.id,
        result: { count: 0 },
      }, client);

      this.broadcastToChannel(
        client.channelId,
        {
          type: "event",
          event: "clear",
          collection: message.collection ?? "all",
        },
        client
      );
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleSize(message: z.infer<typeof ClientMessageSchemas.size>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      const size = await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).size(
        message.collection
      );

      this.send(client.ws, {
        id: message.id,
        result: { size },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleKeys(message: z.infer<typeof ClientMessageSchemas.keys>, client: Client): Promise<void> {
    if (!client.storage) {
      this.send(client.ws, {
        id: message.id,
        error: "Client not authenticated or storage not initialized",
      }, client);
      return;
    }

    try {
      const keys = await (client.storage as BaseStorage<string, Record<string, Record<string, z.ZodTypeAny>>>).keys(
        message.collection
      );

      this.send(client.ws, {
        id: message.id,
        result: { keys },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleAdminListUsers(message: z.infer<typeof ClientMessageSchemas.adminListUsers>, client: Client): Promise<void> {
    try {
      const userIds = this.userBucketManager.getAllUserIds();
      const users = await Promise.all(
        userIds.map(async (userId) => ({
          userId,
          metadata: await this.userBucketManager.getUserMetadata(userId),
        }))
      );

      this.send(client.ws, {
        id: message.id,
        result: { users },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleAdminDeleteUser(message: z.infer<typeof ClientMessageSchemas.adminDeleteUser>, client: Client): Promise<void> {
    try {
      const success = await this.userBucketManager.deleteUserBucket(message.userId);

      this.send(client.ws, {
        id: message.id,
        result: { success },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleAdminUserInfo(message: z.infer<typeof ClientMessageSchemas.adminUserInfo>, client: Client): Promise<void> {
    try {
      const metadata = await this.userBucketManager.getUserMetadata(message.userId);

      this.send(client.ws, {
        id: message.id,
        result: { userId: message.userId, metadata },
      }, client);
    } catch (error) {
      this.send(client.ws, {
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      }, client);
    }
  }

  private async handleHello(data: unknown, client: Client): Promise<void> {
    const parsed = ClientHelloSchema.safeParse(data);

    if (!parsed.success) {
      this.sendEvent(client.ws, {
        type: "error",
        error: `Invalid hello message: ${parsed.error.message}`,
      });
      return;
    }

    const isValid = await this.validateToken(parsed.data.token);

    if (!isValid) {
      this.sendEvent(client.ws, {
        type: "error",
        error: "Invalid token",
      });
      client.ws.close();
      return;
    }

    client.token = parsed.data.token;
    client.channelId = this.deriveChannelId(client.token);

    const encryptionKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const encryptedKey = this.encryptSessionKey(encryptionKey, client.token);

    this.sendEvent(client.ws, {
      type: "hello",
      channelId: client.channelId,
    });

    client.ws.send(
      JSON.stringify({
        type: "encryption",
        encryptionKey: encryptedKey,
        iv: iv.toString("base64"),
      })
    );

    client.encryptionKey = encryptionKey;
    client.iv = iv;
    client.isAuthenticated = true;

    const userBucket = await this.userBucketManager.ensureUserBucket(client.token);
    client.storage = userBucket;

    if (!this.clientsByChannel.has(client.channelId)) {
      this.clientsByChannel.set(client.channelId, new Set());
    }
    this.clientsByChannel.get(client.channelId)!.add(client);

    this.logger.logDebug(`Client authenticated with token, joined channel: ${client.channelId}`);
  }

  private handleMessage(data: string, client: Client): void {
    try {
      let parsed: unknown;

      if (client.encryptionKey) {
        parsed = this.decrypt(data, client);
      } else {
        parsed = JSON.parse(data);
      }

      const message = this.validateClientMessage(parsed);

      switch (message.action) {
        case "get":
          this.handleGet(message, client);
          break;
        case "set":
          this.handleSet(message, client);
          break;
        case "delete":
          this.handleDelete(message, client);
          break;
        case "clear":
          this.handleClear(message, client);
          break;
        case "size":
          this.handleSize(message, client);
          break;
        case "keys":
          this.handleKeys(message, client);
          break;
        case "admin_list_users":
          this.handleAdminListUsers(message, client);
          break;
        case "admin_delete_user":
          this.handleAdminDeleteUser(message, client);
          break;
        case "admin_user_info":
          this.handleAdminUserInfo(message, client);
          break;
      }
    } catch (error) {
      this.sendEvent(client.ws, {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async start(port?: number): Promise<void> {
    await this.initialize();
    this.port = port ?? this.port;

    this.server = Bun.serve({
      port: this.port,
      fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/ws") {
          const upgraded = server.upgrade(req, { data: undefined });
          if (upgraded) {
            return new Response(null, { status: 101 });
          }
          return new Response("Upgrade failed", { status: 400 });
        }

        return new Response("WebSocket Storage Server", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      },
      websocket: {
        open: (ws) => {
          const client: Client = {
            ws,
            token: "",
            channelId: "",
            isAuthenticated: false,
          };
          this.clients.add(client);

          this.logger.logDebug(`Client connected. Total clients: ${this.clients.size}`);
        },
        message: (ws, message) => {
          if (typeof message !== "string") {
            return;
          }

          const client = Array.from(this.clients).find((c) => c.ws === ws);
          if (!client) {
            return;
          }

          if (!client.isAuthenticated) {
            try {
              const parsed = JSON.parse(message);
              if (parsed.type === "hello" && parsed.token) {
                this.handleHello(parsed, client);
              } else {
                this.sendEvent(ws, {
                  type: "error",
                  error: "Not authenticated. Send hello message first.",
                });
              }
            } catch (error) {
              this.sendEvent(ws, {
                type: "error",
                error: "Invalid JSON message",
              });
            }
          } else {
            this.handleMessage(message, client);
          }
        },
        close: (ws) => {
          for (const client of this.clients) {
            if (client.ws === ws) {
              if (client.channelId) {
                const channelClients = this.clientsByChannel.get(client.channelId);
                if (channelClients) {
                  channelClients.delete(client);
                  if (channelClients.size === 0) {
                    this.clientsByChannel.delete(client.channelId);
                  }
                }
              }

              this.clients.delete(client);
              break;
            }
          }

          this.logger.logDebug(`Client disconnected. Total clients: ${this.clients.size}`);
        },
      },
    });

    this.logger.logDebug(`WebSocket Storage Server running on ws://localhost:${this.port}`);
  }

  async stop(): Promise<void> {
    this.logger.logInfo('Stopping WebSocket Storage Server...');
    if (this.server) {
      await this.server.stop(true);
      this.server = null;
    }
    await this.userBucketManager.close();
    this.logger.logInfo('WebSocket Storage Server stopped');
  }
}

