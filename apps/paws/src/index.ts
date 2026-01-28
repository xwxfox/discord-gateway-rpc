export { DiscordRPC } from '@/rpc/DiscordRPC';
export type { DiscordRPCEvents } from '@/rpc/DiscordRPC';

export { ActivityBuilder } from '@/presence/builder';
export type { TimestampMode } from '@/presence/builder';

export { RpcConfigSchema, parseRpcConfig, safeParseRpcConfig } from '@/presence/config';
export type { RpcConfig } from '@/presence/config';

export {
  ActivitySchema,
  PresenceSchema,
  TimestampsSchema,
  AssetsSchema,
  PartySchema,
  ButtonSchema
} from '@/presence/models';
export type { Activity, Presence, Timestamps, Assets, Party, Button, ActivityType, Status } from '@/presence/models';

export { DiscordWebSocket } from '@/gateway/DiscordWebSocket';
export type { DiscordGatewayEvents } from '@/gateway/DiscordWebSocket';

export { OpCode, opCodeFromValue } from '@/gateway/opcodes';
export type { OpCode as OpCodeType } from '@/gateway/opcodes';

export {
  GatewayPayloadSchema,
  IdentifySchema,
  ResumeSchema,
  HeartbeatSchema,
  ReadySchema,
  RequestSoundboardSoundsSchema,
  RequestGuildMembersSchema,
  VoiceStateUpdateSchema,
  GuildMemberChunkSchema,
  ChannelPinsUpdateSchema,
  TypingStartSchema,
  VoiceChannelEffectSendSchema,
  WebhooksUpdateSchema,
  MessagePollVoteAddSchema,
  MessagePollVoteRemoveSchema,
  ChannelSchema
} from '@/gateway/types';
import type { RateLimited } from "@paws/shared-types";
export type { RateLimited }
export type { GatewayPayload, Identify, Resume, Heartbeat, Ready, IdentifyProperties, RequestSoundboardSounds, RequestGuildMembers, VoiceStateUpdate, GuildMemberChunk, GatewayIntentsType, Intent, ChannelPinsUpdate, TypingStart, VoiceChannelEffectSend, WebhooksUpdate, MessagePollVoteAdd, MessagePollVoteRemove, Channel } from '@/gateway/types';

export { GatewayIntents } from '@/gateway/types';

export { EventEmitter } from '@paws/event-emitter';
export type { EventCallback } from '@paws/event-emitter';

export { JsonConfigStorage, WebSocketConfigStorage, createConfigStorage } from '@/storage/config';
export type { ConfigStorage } from '@/storage/config';

export { FileSessionStorage, WebSocketSessionStorage, createSessionStorage } from '@/storage/sessionStorage';
export type { SessionStorage, SessionData } from '@/storage/session';

export { DebugLogger } from '@paws/debug-logger';

export { RateLimiter } from '@paws/rate-limiter';

export { ConnectionMonitor } from '@paws/connection-monitor';
export type { ConnectionMetrics } from '@paws/connection-monitor';
