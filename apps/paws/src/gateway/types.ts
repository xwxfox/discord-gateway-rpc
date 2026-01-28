import { z } from 'zod';
import { OpCode, opCodeFromValue } from './opcodes';
import type { Presence } from '@/presence/models';

export const GatewayPayloadSchema = z.object({
  op: z.number().transform(opCodeFromValue),
  d: z.unknown().optional(),
  s: z.number().nullable().optional(),
  t: z.string().nullable().optional()
});

export type GatewayPayload = z.infer<typeof GatewayPayloadSchema>;

export const GatewayIntentsSchema = z.object({
  GUILDS: z.literal(1 << 0),
  GUILD_MEMBERS: z.literal(1 << 1),
  GUILD_BANS: z.literal(1 << 2),
  GUILD_EMOJIS: z.literal(1 << 3),
  GUILD_INTEGRATIONS: z.literal(1 << 4),
  GUILD_WEBHOOKS: z.literal(1 << 5),
  GUILD_INVITES: z.literal(1 << 6),
  GUILD_VOICE_STATES: z.literal(1 << 7),
  GUILD_PRESENCES: z.literal(1 << 8),
  GUILD_MESSAGES: z.literal(1 << 9),
  GUILD_MESSAGE_REACTIONS: z.literal(1 << 10),
  GUILD_MESSAGE_TYPING: z.literal(1 << 11),
  DIRECT_MESSAGES: z.literal(1 << 12),
  DIRECT_MESSAGE_REACTIONS: z.literal(1 << 13),
  DIRECT_MESSAGE_TYPING: z.literal(1 << 14),
  MESSAGE_CONTENT: z.literal(1 << 15),
  GUILD_SCHEDULED_EVENTS: z.literal(1 << 16),
  AUTO_MODERATION_RULES: z.literal(1 << 17),
  GUILD_MESSAGE_ACTIVITY: z.literal(1 << 18)
});

export const GatewayIntents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_BANS: 1 << 2,
  GUILD_EMOJIS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
  GUILD_SCHEDULED_EVENTS: 1 << 16,
  AUTO_MODERATION_RULES: 1 << 17,
  GUILD_MESSAGE_ACTIVITY: 1 << 18
} as const;

export type GatewayIntentsType = typeof GatewayIntents;
export type Intent = z.infer<typeof GatewayIntentsSchema>[keyof GatewayIntentsType];

export const IdentifyPropertiesSchema = z.object({
  os: z.string(),
  browser: z.string(),
  device: z.string()
});

export type IdentifyProperties = z.infer<typeof IdentifyPropertiesSchema>;

export const IdentifySchema = z.object({
  token: z.string(),
  properties: IdentifyPropertiesSchema,
  compress: z.boolean().optional(),
  large_threshold: z.number().min(50).max(250).optional(),
  shard: z.tuple([z.number(), z.number()]).optional(),
  presence: z.object({
    since: z.number().nullable().optional(),
    activities: z.array(z.unknown()).nullable().optional(),
    status: z.enum(['online', 'dnd', 'idle', 'invisible', 'offline']),
    afk: z.boolean()
  }).optional(),
  intents: z.number().optional()
});

export type Identify = z.infer<typeof IdentifySchema>;

export const ResumeSchema = z.object({
  token: z.string(),
  session_id: z.string(),
  seq: z.number()
});

export type Resume = z.infer<typeof ResumeSchema>;

export const HeartbeatSchema = z.object({
  heartbeat_interval: z.number()
});

export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export const RequestSoundboardSoundsSchema = z.object({
  guild_ids: z.array(z.string())
});

export type RequestSoundboardSounds = z.infer<typeof RequestSoundboardSoundsSchema>;

export const RequestGuildMembersSchema = z.object({
  guild_id: z.string(),
  query: z.string().optional(),
  limit: z.number().optional(),
  presences: z.boolean().optional(),
  user_ids: z.union([z.string(), z.array(z.string())]).optional(),
  nonce: z.string().max(32).optional()
});

export type RequestGuildMembers = z.infer<typeof RequestGuildMembersSchema>;

export const VoiceStateUpdateSchema = z.object({
  guild_id: z.string(),
  channel_id: z.string().nullable(),
  self_mute: z.boolean(),
  self_deaf: z.boolean(),
  self_suppress: z.boolean().optional(),
  token: z.string().optional()
});

export type VoiceStateUpdate = z.infer<typeof VoiceStateUpdateSchema>;

export const ReadySchema = z.object({
  v: z.number(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    discriminator: z.string(),
    global_name: z.string().optional(),
    avatar: z.string().nullable().optional(),
    bot: z.boolean().optional(),
    system: z.boolean().optional(),
    mfa_enabled: z.boolean().optional(),
    locale: z.string().optional(),
    verified: z.boolean().optional(),
    email: z.string().nullable().optional(),
    flags: z.number().optional(),
    premium_type: z.number().optional(),
    public_flags: z.number().optional()
  }),
  guilds: z.array(z.object({
    id: z.string(),
    unavailable: z.boolean().optional()
  })),
  session_id: z.string(),
  resume_gateway_url: z.string(),
  shard: z.tuple([z.number(), z.number()]).optional(),
  application: z.object({
    id: z.string(),
    flags: z.number()
  })
});

export type Ready = z.infer<typeof ReadySchema>;

export const GuildMemberChunkSchema = z.object({
  guild_id: z.string(),
  members: z.array(z.object({
    user: z.object({
      id: z.string(),
      username: z.string(),
      discriminator: z.string(),
      avatar: z.string().nullable().optional()
    }),
    nick: z.string().nullable().optional(),
    roles: z.array(z.string()),
    joined_at: z.string().optional(),
    premium_since: z.string().nullable().optional(),
    deaf: z.boolean(),
    mute: z.boolean()
  })),
  chunk_index: z.number(),
  chunk_count: z.number(),
  not_found: z.array(z.string()).optional(),
  presences: z.array(z.object({
    user: z.object({
      id: z.string()
    }),
    status: z.enum(['online', 'dnd', 'idle', 'invisible', 'offline']),
    activities: z.array(z.object({
      name: z.string(),
      type: z.number(),
      url: z.string().nullable().optional()
    })).optional(),
    client_status: z.object({
      desktop: z.enum(['online', 'dnd', 'idle', 'invisible', 'offline']).optional(),
      mobile: z.enum(['online', 'dnd', 'idle', 'invisible', 'offline']).optional(),
      web: z.enum(['online', 'dnd', 'idle', 'invisible', 'offline']).optional()
    }).optional()
  })).optional(),
  nonce: z.string().optional()
});

export type GuildMemberChunk = z.infer<typeof GuildMemberChunkSchema>;

export const ChannelPinsUpdateSchema = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string(),
  last_pin_timestamp: z.string().nullable().optional()
});

export type ChannelPinsUpdate = z.infer<typeof ChannelPinsUpdateSchema>;

export const TypingStartSchema = z.object({
  channel_id: z.string(),
  user_id: z.string(),
  timestamp: z.number(),
  guild_id: z.string().optional(),
  member: z.object({
    user: z.object({
      id: z.string(),
      username: z.string(),
      discriminator: z.string(),
      avatar: z.string().nullable().optional()
    }),
    roles: z.array(z.string()),
    premium_since: z.string().nullable().optional(),
    permissions: z.string(),
    communication_disabled_until: z.string().nullable().optional()
  }).optional()
});

export type TypingStart = z.infer<typeof TypingStartSchema>;

export const VoiceChannelEffectSendSchema = z.object({
  channel_id: z.string(),
  guild_id: z.string(),
  user_id: z.string(),
  emoji: z.object({
    id: z.string().nullable(),
    name: z.string(),
    animated: z.boolean().optional()
  }),
  animation_type: z.number(),
  animation_id: z.number().optional(),
  sound_id: z.number().optional(),
  sound_volume: z.number().optional()
});

export type VoiceChannelEffectSend = z.infer<typeof VoiceChannelEffectSendSchema>;

export const WebhooksUpdateSchema = z.object({
  guild_id: z.string(),
  channel_id: z.string().optional()
});

export type WebhooksUpdate = z.infer<typeof WebhooksUpdateSchema>;

export const MessagePollVoteAddSchema = z.object({
  user_id: z.string(),
  channel_id: z.string(),
  message_id: z.string(),
  guild_id: z.string(),
  answer_id: z.number()
});

export type MessagePollVoteAdd = z.infer<typeof MessagePollVoteAddSchema>;

export const MessagePollVoteRemoveSchema = z.object({
  user_id: z.string(),
  channel_id: z.string(),
  message_id: z.string(),
  guild_id: z.string(),
  answer_id: z.number()
});

export type MessagePollVoteRemove = z.infer<typeof MessagePollVoteRemoveSchema>;

export const ChannelSchema = z.object({
  id: z.string(),
  type: z.number(),
  guild_id: z.string().optional(),
  position: z.number().optional(),
  name: z.string().optional(),
  topic: z.string().nullable().optional(),
  nsfw: z.boolean().optional(),
  last_message_id: z.string().nullable().optional(),
  bitrate: z.number().optional(),
  user_limit: z.number().optional(),
  rate_limit_per_user: z.number().optional(),
  recipients: z.array(z.unknown()).optional(),
  icon: z.string().nullable().optional(),
  owner_id: z.string().optional(),
  application_id: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  last_pin_timestamp: z.string().nullable().optional(),
  rtc_region: z.string().nullable().optional(),
  video_quality_mode: z.number().optional(),
  message_count: z.number().optional(),
  member_count: z.number().optional(),
  default_auto_archive_duration: z.number().optional(),
  permissions: z.string().optional(),
  flags: z.number().optional(),
  newly_created: z.boolean().optional()
});

export type Channel = z.infer<typeof ChannelSchema>;
