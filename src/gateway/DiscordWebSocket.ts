import { EventEmitter } from '../events';
import type { GatewayPayload, Identify, Resume, Heartbeat, Ready } from './types';
import { OpCode } from './opcodes';
import type { Presence } from '../presence/models';
import { DEFAULT_IDENTITY } from '@/constants';

export interface DiscordGatewayEvents extends Record<string, unknown> {
  ready: Ready;
  error: Error;
  disconnected: { code: number; reason: string };
  heartbeatAck: void;
}

export class DiscordWebSocket extends EventEmitter<DiscordGatewayEvents> {
  private ws: WebSocket | null = null;
  private gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json';
  private sequence = 0;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private heartbeatInterval = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private token: string, private IdentifyOverrides?: Omit<Identify, 'token'>) {
    super();
  }

  async connect(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    try {
      const url = this.resumeGatewayUrl ?? this.gatewayUrl;
      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.connected = false;
        this.reconnectAttempts = 0;
      });

      this.ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const payload: GatewayPayload = JSON.parse(event.data.toString());
          this.handleMessage(payload);
        } catch (error) {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      });

      this.ws.addEventListener('close', (event: CloseEvent) => {
        this.handleClose(event.code, event.reason);
      });

      this.ws.addEventListener('error', (event: Event) => {
        this.emit('error', new Error(`WebSocket error: ${event}`));
      });
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.readyResolve?.();
      this.readyPromise = null;
      throw error;
    }

    return this.readyPromise;
  }

  private handleMessage(payload: GatewayPayload): void {
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
        this.reconnectWebSocket();
        break;
      case OpCode.INVALID_SESSION:
        this.handleInvalidSession();
        break;
      case OpCode.HELLO:
        this.handleHello(payload.d as Heartbeat);
        break;
      case OpCode.HEARTBEAT_ACK:
        this.emit('heartbeatAck', void 0);
        break;
      default:
        break;
    }
  }

  private handleDispatch(payload: GatewayPayload): void {
    if (payload.t === 'READY') {
      const ready = payload.d as Ready;
      this.sessionId = ready.session_id;
      this.resumeGatewayUrl = `${ready.resume_gateway_url}/?v=10&encoding=json`;
      this.connected = true;
      this.emit('ready', ready);
      this.readyResolve?.();
      this.readyPromise = null;
    } else if (payload.t === 'RESUMED') {
      this.connected = true;
      this.readyResolve?.();
      this.readyPromise = null;
    }
  }

  private handleHello(data: Heartbeat): void {
    this.heartbeatInterval = data.heartbeat_interval;
    this.startHeartbeat();

    if (this.sequence > 0 && this.sessionId) {
      this.sendResume();
    } else {
      this.sendIdentify();
    }
  }

  private handleInvalidSession(): void {
    setTimeout(() => {
      this.sendIdentify();
    }, 150);
  }

  private reconnectWebSocket(): void {
    this.ws?.close(4000, 'Attempting to reconnect');
  }

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    this.connected = false;
    this.emit('disconnected', { code, reason });

    if (code === 4000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch((error) => {
          this.emit('error', error);
        });
      }, 200);
    } else {
      this.readyResolve?.();
      this.readyPromise = null;
    }
  }

  private sendIdentify(): void {
    const identify: Identify = {
      ...DEFAULT_IDENTITY,
      ...this.IdentifyOverrides,
      token: this.token,
    };
    this.send(OpCode.IDENTIFY, identify);
  }

  private sendResume(): void {
    const resume: Resume = {
      token: this.token,
      session_id: this.sessionId!,
      seq: this.sequence
    };
    this.send(OpCode.RESUME, resume);
  }

  private sendHeartbeat(): void {
    this.send(OpCode.HEARTBEAT, this.sequence === 0 ? null : this.sequence);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendActivity(presence: Presence): void {
    this.send(OpCode.PRESENCE_UPDATE, presence);
  }

  private send(op: OpCode, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        op,
        d: data
      };
      this.ws.send(JSON.stringify(payload));
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  isReady(): boolean {
    return this.connected;
  }

  close(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.sequence = 0;
    this.removeAllListeners();
    this.readyPromise = null;
    this.readyResolve = null;
    this.reconnectAttempts = 0;
  }
}
