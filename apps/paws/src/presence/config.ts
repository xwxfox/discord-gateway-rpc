import { z } from 'zod';
import { StatusSchema } from './models';

export const RpcConfigSchema = z.object({
  name: z.string().default(''),
  state: z.string().default(''),
  details: z.string().default(''),
  type: z.enum({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }).default(0),
  status: StatusSchema.default('online'),
  platform: z.string().default(''),
  largeImg: z.string().default(''),
  smallImg: z.string().default(''),
  largeText: z.string().default(''),
  smallText: z.string().default(''),
  button1: z.string().default(''),
  button1link: z.string().default(''),
  button2: z.string().default(''),
  button2link: z.string().default(''),
  timestampsStart: z.string().default(''),
  timestampsStop: z.string().default(''),
  partyCurrentSize: z.string().default(''),
  partyMaxSize: z.string().default(''),
  url: z.string().default('')
});

export type RpcConfig = z.infer<typeof RpcConfigSchema>;

export function parseRpcConfig(data: unknown): RpcConfig {
  return RpcConfigSchema.parse(data);
}

export function safeParseRpcConfig(data: unknown): { success: true; data: RpcConfig } | { success: false; error: z.ZodError } {
  const result = RpcConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
