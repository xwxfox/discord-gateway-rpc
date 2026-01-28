import { DiscordWebSocket } from '@/gateway/DiscordWebSocket';
import type { Presence, Status } from '@/presence/models';
import type {
  Ready,
  ChannelPinsUpdate,
  TypingStart,
  VoiceChannelEffectSend,
  WebhooksUpdate,
  MessagePollVoteAdd,
  MessagePollVoteRemove,
  Channel
} from '@/gateway/types';
import { ActivityBuilder } from '@/presence/builder';
import { EventEmitter } from '@paws/event-emitter';
import { DEFAULT_APPLICATION_ID } from '@/constants';
import type { Identify } from '@/gateway/types';

export interface DiscordRPCEvents extends Record<string, unknown> {
  ready: Ready;
  resumed: void;
  error: Error;
  disconnected: { code: number; reason: string };
  rateLimited: { opcode: number; retryAfter: number; meta?: unknown };
  sessionRestored: boolean;
  channelPinsUpdate: ChannelPinsUpdate;
  typingStart: TypingStart;
  voiceChannelEffectSend: VoiceChannelEffectSend;
  webhooksUpdate: WebhooksUpdate;
  messagePollVoteAdd: MessagePollVoteAdd;
  messagePollVoteRemove: MessagePollVoteRemove;
  guildMemberChunk: unknown;
  channelCreate: Channel;
  channelUpdate: Channel;
  channelDelete: Channel;
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
    this.ws.on('ready', (ready) => {
      this.emit('ready', ready);
    });

    this.ws.on('resumed', () => {
      this.emit('resumed', void 0);
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });

    this.ws.on('disconnected', (data) => {
      this.emit('disconnected', data);
    });

    this.ws.on('rateLimited', (data) => {
      this.emit('rateLimited', data);
    });

    this.ws.on('sessionRestored', (restored) => {
      this.emit('sessionRestored', restored);
    });

    this.ws.on('channelPinsUpdate', (data) => {
      this.emit('channelPinsUpdate', data);
    });

    this.ws.on('typingStart', (data) => {
      this.emit('typingStart', data);
    });

    this.ws.on('voiceChannelEffectSend', (data) => {
      this.emit('voiceChannelEffectSend', data);
    });

    this.ws.on('webhooksUpdate', (data) => {
      this.emit('webhooksUpdate', data);
    });

    this.ws.on('messagePollVoteAdd', (data) => {
      this.emit('messagePollVoteAdd', data);
    });

    this.ws.on('messagePollVoteRemove', (data) => {
      this.emit('messagePollVoteRemove', data);
    });

    this.ws.on('guildMemberChunk', (data) => {
      this.emit('guildMemberChunk', data);
    });

    this.ws.on('channelCreate', (data) => {
      this.emit('channelCreate', data);
    });

    this.ws.on('channelUpdate', (data) => {
      this.emit('channelUpdate', data);
    });

    this.ws.on('channelDelete', (data) => {
      this.emit('channelDelete', data);
    });
  }

  async connect(): Promise<void> {
    await this.ws.connect();
  }

  async setActivity(builder: ActivityBuilder): Promise<void> {
    builder.setApplicationId(this.applicationId);
    const activity = builder.build();
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

  getSessionInfo() {
    return this.ws.getSessionInfo();
  }

  async hasStoredSession(): Promise<boolean> {
    return await this.ws.hasStoredSession();
  }

  async clearSession(): Promise<void> {
    await this.ws.clearSession();
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
