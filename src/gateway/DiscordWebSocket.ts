import { EventEmitter } from '@/events';
import type {
  GatewayPayload,
  Identify,
  Resume,
  Heartbeat,
  Ready,
  RateLimited,
  ChannelPinsUpdate,
  TypingStart,
  VoiceChannelEffectSend,
  WebhooksUpdate,
  MessagePollVoteAdd,
  MessagePollVoteRemove,
  Channel
} from './types';
import { OpCode } from './opcodes';
import type { Presence } from '@/presence/models';
import { DEFAULT_IDENTITY } from '@/constants';
import { DebugLogger } from '@/utils/debugLogger';
import { RateLimiter } from '@/utils/rateLimiter';
import { ConnectionMonitor } from '@/utils/connectionMonitor';
import type { SessionStorage, SessionData } from '@/storage/session';

export interface DiscordGatewayEvents extends Record<string, unknown> {
  ready: Ready;
  resumed: void;
  error: Error;
  disconnected: { code: number; reason: string };
  heartbeatAck: void;
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

export class DiscordWebSocket extends EventEmitter<DiscordGatewayEvents> {
  private ws: WebSocket | null = null;
  private gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json';
  private sequence = 0;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private heartbeatInterval = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAckTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatAckReceived = false;
  private connected = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isResuming = false;
  private sessionRestored = false;

  private debugLogger: DebugLogger;
  private rateLimiter: RateLimiter;
  private connectionMonitor: ConnectionMonitor;
  private sessionStorage: SessionStorage;

  constructor(
    private token: string,
    private IdentifyOverrides?: Omit<Identify, 'token'>,
    sessionStorage?: SessionStorage
  ) {
    super();
    this.debugLogger = new DebugLogger();
    this.rateLimiter = new RateLimiter();
    this.connectionMonitor = new ConnectionMonitor();
    this.sessionStorage = sessionStorage ?? this.createDefaultSessionStorage();
  }

  private createDefaultSessionStorage(): SessionStorage {
    const { createSessionStorage } = require('@/storage/sessionStorage');
    return createSessionStorage('file', './.sessions');
  }

  async connect(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    this.debugLogger.logStateChange('connecting');
    this.connectionMonitor.recordConnectAttempt();

    try {
      const url = this.resumeGatewayUrl ?? this.gatewayUrl;

      const session = await this.sessionStorage.load(this.token);

      this.isResuming = session !== null;
      this.debugLogger.logInfo('Attempting connection', { url, isResuming: this.isResuming });

      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.connected = false;
        this.reconnectAttempts = 0;
        this.connectionMonitor.recordConnectSuccess();
        this.debugLogger.logStateChange('connected');
      });

      this.ws.addEventListener('message', (event: MessageEvent) => {
        try {
          this.debugLogger.logIncoming(event.data, 'network');
          const payload: GatewayPayload = JSON.parse(event.data.toString());
          this.debugLogger.logIncoming(payload, 'application');
          this.connectionMonitor.recordMessageReceived(event.data.length);
          this.handleMessage(payload);
        } catch (error) {
          this.debugLogger.logError('Failed to parse message', error);
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      });

      this.ws.addEventListener('close', (event: CloseEvent) => {
        this.debugLogger.logInfo('WebSocket closed', { code: event.code, reason: event.reason });
        this.connectionMonitor.recordDisconnect();
        this.handleClose(event.code, event.reason);
      });

      this.ws.addEventListener('error', (event: Event) => {
        this.connectionMonitor.recordConnectFailure();
        this.debugLogger.logError('WebSocket error', event);
        this.emit('error', new Error(`WebSocket error: ${event}`));
      });
    } catch (error) {
      this.connectionMonitor.recordConnectFailure();
      this.debugLogger.logError('Connection failed', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.readyResolve?.();
      this.readyPromise = null;
      throw error;
    }

    return this.readyPromise;
  }

  private async handleMessage(payload: GatewayPayload): Promise<void> {
    if (payload.s !== null && payload.s !== undefined) {
      this.sequence = payload.s;
    }

    switch (payload.op) {
      case OpCode.DISPATCH:
        this.handleDispatch(payload);
        break;
      case OpCode.HEARTBEAT:
        this.sendHeartbeat();
        break;
      case OpCode.RECONNECT:
        this.debugLogger.logInfo('Received RECONNECT, initiating reconnect');
        this.reconnectWebSocket();
        break;
      case OpCode.INVALID_SESSION:
        await this.handleInvalidSession(payload.d as boolean);
        break;
      case OpCode.HELLO:
        this.handleHello(payload.d as Heartbeat);
        break;
      case OpCode.HEARTBEAT_ACK:
        this.handleHeartbeatAck();
        break;
      case OpCode.REQUEST_SOUNDBOARD_SOUNDS:
        this.debugLogger.logInfo('Received REQUEST_SOUNDBOARD_SOUNDS (unexpected for receive)');
        break;
      default:
        this.debugLogger.logWarn(`Unknown opcode: ${payload.op}`);
        break;
    }
  }

  private async handleDispatch(payload: GatewayPayload): Promise<void> {
    if (!payload.t) return;

    const eventType = payload.t;

    switch (eventType) {
      case 'READY':
        await this.handleReady(payload.d as Ready);
        break;

      case 'RESUMED':
        await this.handleResumed();
        break;

      case 'RATE_LIMITED':
        this.handleRateLimited(payload.d as RateLimited);
        break;

      case 'CHANNEL_PINS_UPDATE':
        this.emit('channelPinsUpdate', payload.d as ChannelPinsUpdate);
        break;

      case 'TYPING_START':
        this.emit('typingStart', payload.d as TypingStart);
        break;

      case 'VOICE_CHANNEL_EFFECT_SEND':
        this.emit('voiceChannelEffectSend', payload.d as VoiceChannelEffectSend);
        break;

      case 'WEBHOOKS_UPDATE':
        this.emit('webhooksUpdate', payload.d as WebhooksUpdate);
        break;

      case 'MESSAGE_POLL_VOTE_ADD':
        this.emit('messagePollVoteAdd', payload.d as MessagePollVoteAdd);
        break;

      case 'MESSAGE_POLL_VOTE_REMOVE':
        this.emit('messagePollVoteRemove', payload.d as MessagePollVoteRemove);
        break;

      case 'GUILD_MEMBERS_CHUNK':
        this.emit('guildMemberChunk', payload.d);
        break;

      case 'CHANNEL_CREATE':
        this.emit('channelCreate', payload.d as Channel);
        break;

      case 'CHANNEL_UPDATE':
        this.emit('channelUpdate', payload.d as Channel);
        break;

      case 'CHANNEL_DELETE':
        this.emit('channelDelete', payload.d as Channel);
        break;

      default:
        this.debugLogger.logDebug(`Unhandled event type: ${eventType}`);
        break;
    }
  }

  private async handleReady(ready: Ready): Promise<void> {
    this.sessionId = ready.session_id;
    this.resumeGatewayUrl = `${ready.resume_gateway_url}/?v=10&encoding=json`;
    this.connected = true;
    this.sessionRestored = this.isResuming;

    this.debugLogger.logInfo('Ready received', {
      sessionId: this.sessionId,
      sessionRestored: this.sessionRestored
    });

    const sessionData: SessionData = {
      token: this.token,
      sessionId: this.sessionId,
      sequence: this.sequence,
      resumeGatewayUrl: this.resumeGatewayUrl,
      timestamp: Date.now(),
      userId: ready.user.id
    };

    await this.sessionStorage.save(this.token, sessionData);

    this.emit('ready', ready);
    this.emit('sessionRestored', this.sessionRestored);
    this.readyResolve?.();
    this.readyPromise = null;
  }

  private async handleResumed(): Promise<void> {
    this.connected = true;
    this.sessionRestored = true;
    this.debugLogger.logInfo('Session resumed');

    const session = await this.sessionStorage.load(this.token);
    if (session) {
      session.sequence = this.sequence;
      await this.sessionStorage.save(this.token, session);
    }

    this.emit('resumed', void 0);
    this.emit('sessionRestored', true);
    this.readyResolve?.();
    this.readyPromise = null;
  }

  private handleHello(data: Heartbeat): void {
    this.heartbeatInterval = data.heartbeat_interval;
    this.debugLogger.logInfo('Hello received', { heartbeatInterval: this.heartbeatInterval });
    this.startHeartbeat();

    const attemptResume = async (): Promise<void> => {
      if (this.sequence > 0 && this.sessionId) {
        this.debugLogger.logInfo('Attempting to resume session', {
          sessionId: this.sessionId,
          sequence: this.sequence
        });
        await this.sendResume();
      } else {
        this.debugLogger.logInfo('No session to resume, sending identify');
        await this.sendIdentify();
      }
    };

    attemptResume().catch((error) => {
      this.debugLogger.logError('Failed to send identify/resume', error);
      this.emit('error', error);
    });
  }

  private async handleInvalidSession(canResume: boolean): Promise<void> {
    this.debugLogger.logWarn('Invalid session', { canResume });
    this.stopHeartbeat();

    if (canResume) {
      this.debugLogger.logInfo('Session may be resumable, attempting resume');
      setTimeout(async () => {
        try {
          await this.sendResume();
        } catch (error) {
          this.debugLogger.logError('Resume failed, trying identify', error);
          await this.sendIdentify();
        }
      }, 150);
    } else {
      this.debugLogger.logInfo('Session not resumable, clearing and identifying');
      this.sessionId = null;
      this.resumeGatewayUrl = null;
      this.sequence = 0;
      await this.sessionStorage.delete(this.token);

      setTimeout(async () => {
        await this.sendIdentify();
      }, 150);
    }
  }

  private handleRateLimited(data: RateLimited): void {
    this.debugLogger.logWarn('Rate limited', {
      opcode: data.opcode,
      retryAfter: data.retry_after,
      meta: data.meta
    });

    this.rateLimiter.trackRateLimit(data.opcode, data);

    this.emit('rateLimited', {
      opcode: data.opcode,
      retryAfter: data.retry_after,
      meta: data.meta
    });
  }

  private handleHeartbeatAck(): void {
    this.heartbeatAckReceived = true;
    this.debugLogger.logDebug('Heartbeat ACK received');

    if (this.startHeartbeatTimestamp > 0) {
      const latency = Date.now() - this.startHeartbeatTimestamp;
      this.connectionMonitor.recordHeartbeatSuccess(latency);
      this.startHeartbeatTimestamp = 0;
    }

    if (this.heartbeatAckTimeout) {
      clearTimeout(this.heartbeatAckTimeout);
      this.heartbeatAckTimeout = null;
    }

    this.emit('heartbeatAck', void 0);
  }

  private async handleHeartbeatTimeout(): Promise<void> {
    this.connectionMonitor.recordHeartbeatFailure();
    this.debugLogger.logError('Heartbeat timeout, closing connection');
    this.emit('error', new Error('Heartbeat timeout'));
    this.close();
  }

  private startHeartbeatTimestamp: number = 0;

  private reconnectWebSocket(): void {
    this.debugLogger.logInfo('Initiating reconnect');
    this.ws?.close(4000, 'Attempting to reconnect');
  }

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    this.connected = false;
    this.debugLogger.logStateChange('disconnected');
    this.emit('disconnected', { code, reason });

    if (code === 4000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(200 * Math.pow(2, this.reconnectAttempts), 5000);
      this.debugLogger.logInfo(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch((error) => {
          this.debugLogger.logError('Reconnect failed', error);
          this.emit('error', error);
        });
      }, delay);
    } else {
      this.readyResolve?.();
      this.readyPromise = null;
    }
  }

  private async sendIdentify(): Promise<void> {
    const identify: Identify = {
      ...DEFAULT_IDENTITY,
      ...this.IdentifyOverrides,
      token: this.token
    };

    this.debugLogger.logOutgoing(OpCode.IDENTIFY, identify, 'application');
    this.send(OpCode.IDENTIFY, identify);
  }

  private async sendResume(): Promise<void> {
    const resume: Resume = {
      token: this.token,
      session_id: this.sessionId!,
      seq: this.sequence
    };

    this.debugLogger.logOutgoing(OpCode.RESUME, resume, 'application');
    this.send(OpCode.RESUME, resume);
  }

  private sendHeartbeat(): void {
    const data = this.sequence === 0 ? null : this.sequence;
    this.startHeartbeatTimestamp = Date.now();
    this.debugLogger.logOutgoing(OpCode.HEARTBEAT, data, 'application');
    this.send(OpCode.HEARTBEAT, data);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatAckReceived = false;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();

      this.heartbeatAckReceived = false;
      this.heartbeatAckTimeout = setTimeout(async () => {
        if (!this.heartbeatAckReceived) {
          await this.handleHeartbeatTimeout();
        }
      }, this.heartbeatInterval);
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatAckTimeout) {
      clearTimeout(this.heartbeatAckTimeout);
      this.heartbeatAckTimeout = null;
    }
  }

  sendActivity(presence: Presence): void {
    this.debugLogger.logOutgoing(OpCode.PRESENCE_UPDATE, presence, 'application');
    this.send(OpCode.PRESENCE_UPDATE, presence);
  }

  async requestGuildMembers(guildId: string, options?: {
    query?: string;
    limit?: number;
    presences?: boolean;
    userIds?: string | string[];
    nonce?: string;
  }): Promise<void> {
    const data = {
      guild_id: guildId,
      query: options?.query ?? '',
      limit: options?.limit ?? 0,
      presences: options?.presences ?? false,
      user_ids: options?.userIds,
      nonce: options?.nonce
    };

    await this.rateLimiter.waitForAvailability(OpCode.REQUEST_GUILD_MEMBERS);
    this.debugLogger.logOutgoing(OpCode.REQUEST_GUILD_MEMBERS, data, 'application');
    this.send(OpCode.REQUEST_GUILD_MEMBERS, data);
  }

  async requestSoundboardSounds(guildIds: string[]): Promise<void> {
    const data = { guild_ids: guildIds };

    await this.rateLimiter.waitForAvailability(OpCode.REQUEST_SOUNDBOARD_SOUNDS);
    this.debugLogger.logOutgoing(OpCode.REQUEST_SOUNDBOARD_SOUNDS, data, 'application');
    this.send(OpCode.REQUEST_SOUNDBOARD_SOUNDS, data);
  }

  private send(op: OpCode, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        op,
        d: data
      };
      const json = JSON.stringify(payload);
      this.debugLogger.logOutgoing(op, data, 'websocket');

      try {
        this.ws.send(json);
        this.debugLogger.logOutgoing(op, data, 'network');
      } catch (error) {
        this.debugLogger.logError('Failed to send message', error);
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      this.debugLogger.logError('WebSocket not ready', {
        readyState: this.ws?.readyState,
        op
      });
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  isReady(): boolean {
    return this.connected;
  }

  getSessionInfo(): { sessionId: string | null; sequence: number; restored: boolean } | null {
    if (!this.sessionId) return null;

    return {
      sessionId: this.sessionId,
      sequence: this.sequence,
      restored: this.sessionRestored
    };
  }

  async hasStoredSession(): Promise<boolean> {
    return await this.sessionStorage.hasSession(this.token);
  }

  async clearSession(): Promise<void> {
    await this.sessionStorage.delete(this.token);
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.sequence = 0;
    this.debugLogger.logInfo('Session cleared');
  }

  getConnectionMetrics() {
    return this.connectionMonitor.getMetrics();
  }

  getHealthStatus() {
    return this.connectionMonitor.getHealthStatus();
  }

  getUptime(): number {
    return this.connectionMonitor.getUptime();
  }

  close(): void {
    this.debugLogger.logInfo('Closing connection');
    this.stopHeartbeat();
    this.rateLimiter.clear();
    this.connectionMonitor.recordDisconnect();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.sequence = 0;
    this.sessionRestored = false;
    this.removeAllListeners();
    this.readyPromise = null;
    this.readyResolve = null;
    this.reconnectAttempts = 0;
    this.isResuming = false;
  }
}
