import { DiscordWebSocket } from '../gateway/DiscordWebSocket';
import type { Presence, Status } from '../presence/models';
import { ActivityBuilder } from '../presence/builder';
import { EventEmitter } from '../events';
import { DEFAULT_APPLICATION_ID } from '../constants';
import type { Identify } from '@/gateway/types';

export interface DiscordRPCEvents extends Record<string, unknown> {
  ready: void;
  error: Error;
  disconnected: { code: number; reason: string };
}

export class DiscordRPC extends EventEmitter<DiscordRPCEvents> {
  private ws: DiscordWebSocket;
  private currentActivity: Presence | null = null;
  private status: Status = 'online';
  private applicationId: string;

  constructor(token: string, applicationId?: string, IdentifyOverrides?: Omit<Identify, 'token'>) {
    super();
    this.applicationId = applicationId ?? DEFAULT_APPLICATION_ID;
    this.ws = new DiscordWebSocket(token, IdentifyOverrides);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.ws.on('ready', () => {
      this.emit('ready', void 0);
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });

    this.ws.on('disconnected', (data) => {
      this.emit('disconnected', data);
    });
  }

  async connect(): Promise<void> {
    await this.ws.connect();
  }

  async setActivity(builder: ActivityBuilder): Promise<void> {
    builder.setApplicationId(this.applicationId);
    const activity = builder.build();
    console.dir(activity);
    const presence: Presence = {
      activities: [activity],
      status: this.status,
      afk: true,
      since: Date.now()
    };
    this.currentActivity = presence;
    await this.waitForConnection();
    this.ws.sendActivity(presence);
  }

  async updateActivity(builder: ActivityBuilder): Promise<void> {
    await this.setActivity(builder);
  }

  async clearActivity(): Promise<void> {
    const presence: Presence = {
      activities: null,
      status: this.status,
      afk: false,
      since: null
    };
    this.currentActivity = presence;
    await this.waitForConnection();
    this.ws.sendActivity(presence);
  }

  setStatus(status: Status): this {
    this.status = status;
    if (this.currentActivity) {
      this.currentActivity.status = status;
      this.ws.sendActivity(this.currentActivity);
    }
    return this;
  }

  private async waitForConnection(): Promise<void> {
    while (!this.ws.isReady()) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  isConnected(): boolean {
    return this.ws.isConnected();
  }

  disconnect(): void {
    this.ws.close();
  }

  override on<K extends keyof DiscordRPCEvents>(event: K, callback: (data: DiscordRPCEvents[K]) => void): void {
    super.on(event, callback);
  }

  override off<K extends keyof DiscordRPCEvents>(event: K, callback: (data: DiscordRPCEvents[K]) => void): void {
    super.off(event, callback);
  }

  override removeAllListeners<K extends keyof DiscordRPCEvents>(event?: K): void {
    super.removeAllListeners(event);
  }
}
