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
  RateLimitedSchema,
  GuildMemberChunkSchema,
  ChannelPinsUpdateSchema,
  TypingStartSchema,
  VoiceChannelEffectSendSchema,
  WebhooksUpdateSchema,
  MessagePollVoteAddSchema,
  MessagePollVoteRemoveSchema,
  ChannelSchema
} from '@/gateway/types';
export type { GatewayPayload, Identify, Resume, Heartbeat, Ready, IdentifyProperties, RequestSoundboardSounds, RequestGuildMembers, VoiceStateUpdate, RateLimited, GuildMemberChunk, GatewayIntentsType, Intent, ChannelPinsUpdate, TypingStart, VoiceChannelEffectSend, WebhooksUpdate, MessagePollVoteAdd, MessagePollVoteRemove, Channel } from '@/gateway/types';

export { GatewayIntents } from '@/gateway/types';

export { EventEmitter } from '@/events';
export type { EventCallback } from '@/events';

export { JsonConfigStorage, WebSocketConfigStorage, createConfigStorage } from '@/storage/config';
export type { ConfigStorage } from '@/storage/config';

export { FileSessionStorage, WebSocketSessionStorage, createSessionStorage } from '@/storage/sessionStorage';
export type { SessionStorage, SessionData } from '@/storage/session';

export { DebugLogger } from '@/utils/debugLogger';

export { RateLimiter } from '@/utils/rateLimiter';

export { ConnectionMonitor } from '@/utils/connectionMonitor';
export type { ConnectionMetrics } from '@/utils/connectionMonitor';
