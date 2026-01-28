import { EventEmitter } from '@paws/event-emitter';
import { OpCode } from './opcodes';

import type {
    AuthHeartbeatAckPayload,
    AuthHeartbeatPayload,
    AuthHelloPayload,
    AuthInitializePayload,
    AuthNonceProofReceivedPayload,
    AuthNonceProofRequestPayload,
    AuthPendingLoginPayload,
    AuthPendingRemoteInitPayload,
    AuthPendingTicketPayload,
    AuthGatewayPayload,
    AuthCancelPayload,
    MiniDiscordProfile,
} from './types';
import { mapAuthOpCodeToSchema, MiniDiscordProfileSchema } from './types';
import { constants, generateKeyPairSync, privateDecrypt } from "crypto";

import { DebugLogger } from '@paws/debug-logger';
import { ConnectionMonitor } from '@paws/connection-monitor';
import { StringDecoder } from 'string_decoder';

export interface AuthGatewayEvents extends Record<string, unknown> {
    success: { miniUserProfile: MiniDiscordProfile, token: string }
    codeScanned: { user: MiniDiscordProfile },
    error: Error;
    qrCodeGenerated: { url: string; fingerprint: string };
    disconnected: { code: number | string; reason: string };
}

export class AuthWebSocket extends EventEmitter<AuthGatewayEvents> {
    private ws: WebSocket | null = null;
    private gatewayUrl = 'wss://remote-auth-gateway.discord.gg/?v=2';
    private heartbeatInterval = 0;
    private heartbeatAckTimeoutMs = 500;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private heartbeatAckTimeout: ReturnType<typeof setTimeout> | null = null;
    private heartbeatAckReceived = false;
    private connected = false;
    private readyPromise: Promise<void> | null = null;
    private readyResolve: (() => void) | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    private debugLogger: DebugLogger;
    private connectionMonitor: ConnectionMonitor;

    private key = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        }
    })

    private miniUserProfile: MiniDiscordProfile | null = null;

    constructor() {
        super();
        this.debugLogger = new DebugLogger(false);
        this.connectionMonitor = new ConnectionMonitor();

        this.debugLogger.logInfo('AuthWebSocket initialized');
        this.connect().catch((error) => {
            this.debugLogger.logError('Initial connection failed', error);
            this.emit('error', error);
        });
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
            this.debugLogger.logInfo('Attempting connection', { url: this.gatewayUrl });

            this.ws = new WebSocket(this.gatewayUrl, { headers: { 'Origin': 'https://discord.com' } });

            this.ws.addEventListener('open', () => {
                this.connected = false;
                this.reconnectAttempts = 0;
                this.connectionMonitor.recordConnectSuccess();
                this.debugLogger.logStateChange('connected');
            });

            this.ws.addEventListener('message', (event: MessageEvent) => {
                try {
                    this.debugLogger.logIncoming(event.data, 'network');
                    const payload: AuthGatewayPayload = JSON.parse(event.data.toString());
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

    private async handleMessage(payload: AuthGatewayPayload): Promise<void> {
        switch (payload.op) {
            case OpCode.CANCEL:
                this.handleClose(payload.code ? payload.code : payload.op, payload.reason);
                break;
            case OpCode.HEARTBEAT_ACK:
                this.handleHeartbeatAck();
                break;
            case OpCode.HELLO:
                this.handleHello(payload as AuthHelloPayload);
                break;
            case OpCode.NONCE_PROOF:
                this.handleNonceProof(payload);
                break;
            case OpCode.PENDING_REMOTE_INIT:
                this.handlePendingRemoteInit(payload);
                break;
            case OpCode.PENDING_TICKET:
                this.handlePendingTicket(payload);
                break;
            case OpCode.PENDING_LOGIN:
                this.handlePendingLogin(payload);
                break;
            default:
                this.debugLogger.logWarn(`Unknown opcode: ${payload.op}`);
                break;
        }
    }

    private handleHello(payload: AuthHelloPayload): void {
        this.heartbeatInterval = payload.heartbeat_interval;
        this.heartbeatAckTimeoutMs = payload.timeout_ms
        this.debugLogger.logInfo('Hello received', { heartbeatInterval: this.heartbeatInterval });
        this.startHeartbeat();
        this.readyResolve?.();
        this.readyPromise = null;

        this.handleSendInit();
    }

    private get encodedPublicKey(): string {
        const decoder = new StringDecoder('utf-8');
        let pub_key = decoder.write(this.key.publicKey)
        pub_key = (pub_key.split('\n').slice(1, -2)).join('')
        return pub_key
    }

    private handleSendInit(): void {
        const payload: AuthInitializePayload = {
            op: OpCode.INIT,
            encoded_public_key: this.encodedPublicKey
        };

        this.debugLogger.logInfo('Sending INIT payload', { publicKey: this.encodedPublicKey });
        this.send(OpCode.INIT, payload);
    }

    private decryptPayload(encrypted: string) {
        let payload = Buffer.from(encrypted, 'base64')

        let decrypted = privateDecrypt(
            {
                key: this.key.privateKey,
                padding: constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            payload
        )

        return decrypted
    }

    private handleNonceProof(payload: AuthGatewayPayload): void {
        const nonceProofPayload = payload as AuthNonceProofReceivedPayload;
        this.debugLogger.logInfo('Nonce proof received', { encrypted_nonce: nonceProofPayload.encrypted_nonce });

        const decrypted = this.decryptPayload(nonceProofPayload.encrypted_nonce);
        const proof = decrypted.toString('base64url');

        const responsePayload: AuthNonceProofRequestPayload = {
            op: OpCode.NONCE_PROOF,
            nonce: proof
        };

        this.debugLogger.logInfo('Sending NONCE_PROOF payload', { nonce: proof });
        this.send(OpCode.NONCE_PROOF, responsePayload);
    }


    private handlePendingRemoteInit(payload: AuthGatewayPayload): void {
        const pendingRemoteInitPayload = payload as AuthPendingRemoteInitPayload;
        this.debugLogger.logInfo('Pending remote init received', { fingerprint: pendingRemoteInitPayload.fingerprint });

        const fingerprint = pendingRemoteInitPayload.fingerprint;
        const qrCodeUrl = this.generateQRCodeUrl(fingerprint);

        this.debugLogger.logInfo('QR Code generated', { url: qrCodeUrl, fingerprint });
        this.emit('qrCodeGenerated', { url: qrCodeUrl, fingerprint });
    }

    private generateQRCodeUrl(fingerprint: string): string {
        return `https://discord.com/ra/${fingerprint}`;
    }

    private createAvatarUrl(userId: string, avatarHash: string): string {
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
    }

    private parseMiniDiscordUserProfile(encoded: ArrayBuffer): MiniDiscordProfile {
        let values = Buffer.from(encoded).toString("utf-8").split(':');
        const UserProfile = {
            id: values[0],
            username: values[3],
            discriminator: values[1],
            avatar_hash: values[2],
            avatar_url: this.createAvatarUrl(values[0]!, values[2]!)
        };

        return MiniDiscordProfileSchema.parse(UserProfile);
    }

    private handlePendingTicket(payload: AuthGatewayPayload): void {
        const pendingTicketPayload = payload as AuthPendingTicketPayload;
        this.debugLogger.logInfo('Pending ticket received', { encrypted_user_payload: pendingTicketPayload.encrypted_user_payload });

        const decrypted = this.decryptPayload(pendingTicketPayload.encrypted_user_payload);
        this.debugLogger.logDebug('Decrypted user payload', { decrypted: decrypted.toString('utf-8') });

        this.miniUserProfile = this.parseMiniDiscordUserProfile(decrypted.buffer);
        this.emit("codeScanned", { user: this.miniUserProfile })
        this.debugLogger.logInfo('User payload decrypted', { userPayload: this.miniUserProfile });
    }

    private async handlePendingLogin(payload: AuthGatewayPayload): Promise<void> {
        const pendingLoginPayload = payload as AuthPendingLoginPayload;
        this.debugLogger.logInfo('Pending login received', { ticket: pendingLoginPayload.ticket });
        const token = await this.exchangeTicket(pendingLoginPayload.ticket);
        this.debugLogger.logInfo('Login successful - Trimmed token:', { token: token.slice(0, 33) });

        this.emit("success", {
            miniUserProfile: this.miniUserProfile!,
            token
        })

        this.close();
    }


    private async exchangeTicket(ticket: string): Promise<string> {
        const { encrypted_token } = await (await fetch('https://discord.com/api/v9/users/@me/remote-auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ticket })
        })).json() as { encrypted_token: string };

        const decrypted = this.decryptPayload(encrypted_token);
        const token = decrypted.toString('utf-8');
        return token;
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

    }

    private async handleHeartbeatTimeout(): Promise<void> {
        this.connectionMonitor.recordHeartbeatFailure();
        this.debugLogger.logError('Heartbeat timeout, closing connection');
        this.emit('error', new Error('Heartbeat timeout'));
        this.close();
    }

    private startHeartbeatTimestamp: number = 0;

    private handleClose(code: number | string, reason: string | undefined): void {
        this.stopHeartbeat();
        this.connected = false;
        this.debugLogger.logStateChange('disconnected');
        this.emit('disconnected', { code, reason: reason ? reason : 'Connection closed' });

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

    private sendHeartbeat(): void {
        this.startHeartbeatTimestamp = Date.now();
        this.debugLogger.logOutgoing(OpCode.HEARTBEAT, {}, 'application');
        this.send(OpCode.HEARTBEAT, {});
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
            }, this.heartbeatAckTimeoutMs);
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

    private send(op: OpCode, payload: Omit<AuthGatewayPayload, "op">): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const data = {
                op: op, ...payload
            };
            const json = JSON.stringify(data);
            this.debugLogger.logOutgoing(op, data, 'websocket');

            try {
                this.ws.send(json);
                this.debugLogger.logOutgoing(data.op, data, 'network');
            } catch (error) {
                this.debugLogger.logError('Failed to send message', error);
                this.emit('error', error instanceof Error ? error : new Error(String(error)));
            }
        } else {
            this.debugLogger.logError('WebSocket not ready', {
                readyState: this.ws?.readyState,
                op: op
            });
        }
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    isReady(): boolean {
        return this.connected;
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
        this.connectionMonitor.recordDisconnect();
        this.ws?.close();
        this.ws = null;
        this.connected = false;
        this.removeAllListeners();
        this.readyPromise = null;
        this.readyResolve = null;
        this.reconnectAttempts = 0;
    }
}
