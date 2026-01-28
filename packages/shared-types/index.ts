import { z } from "zod";

export const RateLimitedSchema = z.object({
    opcode: z.number(),
    retry_after: z.number(),
    meta: z.object({
        guild_id: z.string().optional(),
        nonce: z.string().optional()
    }).optional()
});

export type RateLimited = z.infer<typeof RateLimitedSchema>;
