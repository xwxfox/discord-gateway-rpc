import { z } from 'zod';
import { OpCode, opCodeFromValue } from './opcodes';

export const GatewayPayloadSchema = z.object({
  op: z.number().transform(opCodeFromValue),
  d: z.unknown().optional(),
  s: z.number().nullable().optional(),
  t: z.string().nullable().optional()
});

export type GatewayPayload = z.infer<typeof GatewayPayloadSchema>;

export const IdentifyPropertiesSchema = z.object({
  browser: z.string(),
  device: z.string(),
  os: z.string()
});

export type IdentifyProperties = z.infer<typeof IdentifyPropertiesSchema>;

export const IdentifySchema = z.object({
  token: z.string(),
  properties: IdentifyPropertiesSchema,
  compress: z.boolean(),
  large_threshold: z.number(),
  capabilities: z.number()
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

export const ReadySchema = z.object({
  session_id: z.string(),
  resume_gateway_url: z.string()
});

export type Ready = z.infer<typeof ReadySchema>;
