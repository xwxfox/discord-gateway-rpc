import { z } from 'zod';
import { OpCode, opCodeFromValue } from './opcodes';

export const AuthHelloPayloadSchema = z.object({
    op: z.literal(OpCode.HELLO),
    heartbeat_interval: z.number(),
    timeout_ms: z.number()
});

export const AuthInitializePayloadSchema = z.object({
    op: z.literal(OpCode.INIT),
    encoded_public_key: z.string()
});

export const AuthNonceProofReceivedPayloadSchema = z.object({
    op: z.literal(OpCode.NONCE_PROOF),
    encrypted_nonce: z.string()
});

export const AuthNonceProofRequestPayloadSchema = z.object({
    op: z.literal(OpCode.NONCE_PROOF),
    nonce: z.string()
});

export const AuthPendingRemoteInitPayloadSchema = z.object({
    op: z.literal(OpCode.PENDING_REMOTE_INIT),
    fingerprint: z.string()
});

export const AuthHeartbeatPayloadSchema = z.object({
    op: z.literal(OpCode.HEARTBEAT)
});

export const AuthHeartbeatAckPayloadSchema = z.object({
    op: z.literal(OpCode.HEARTBEAT_ACK)
});

export const AuthPendingTicketPayloadSchema = z.object({
    op: z.literal(OpCode.PENDING_TICKET),
    encrypted_user_payload: z.string()
});

export const AuthPendingLoginPayloadSchema = z.object({
    op: z.literal(OpCode.PENDING_LOGIN),
    ticket: z.string()
});

export const AuthCancelPayloadSchema = z.object({
    op: z.literal(OpCode.CANCEL),
    reason: z.string().optional(),
    code: z.number().optional()
});

export type AuthHelloPayload = z.infer<typeof AuthHelloPayloadSchema>;
export type AuthInitializePayload = z.infer<typeof AuthInitializePayloadSchema>;
export type AuthNonceProofReceivedPayload = z.infer<typeof AuthNonceProofReceivedPayloadSchema>;
export type AuthNonceProofRequestPayload = z.infer<typeof AuthNonceProofRequestPayloadSchema>;
export type AuthPendingRemoteInitPayload = z.infer<typeof AuthPendingRemoteInitPayloadSchema>;
export type AuthHeartbeatPayload = z.infer<typeof AuthHeartbeatPayloadSchema>;
export type AuthHeartbeatAckPayload = z.infer<typeof AuthHeartbeatAckPayloadSchema>;
export type AuthPendingTicketPayload = z.infer<typeof AuthPendingTicketPayloadSchema>;
export type AuthPendingLoginPayload = z.infer<typeof AuthPendingLoginPayloadSchema>;
export type AuthCancelPayload = z.infer<typeof AuthCancelPayloadSchema>;

export const mapAuthOpCodeToSchema: Record<OpCode, z.ZodType> = {
    [OpCode.HELLO]: AuthHelloPayloadSchema,
    [OpCode.INIT]: AuthInitializePayloadSchema,
    [OpCode.NONCE_PROOF]: z.union([AuthNonceProofReceivedPayloadSchema, AuthNonceProofRequestPayloadSchema]),
    [OpCode.PENDING_REMOTE_INIT]: AuthPendingRemoteInitPayloadSchema,
    [OpCode.HEARTBEAT]: AuthHeartbeatPayloadSchema,
    [OpCode.HEARTBEAT_ACK]: AuthHeartbeatAckPayloadSchema,
    [OpCode.PENDING_TICKET]: AuthPendingTicketPayloadSchema,
    [OpCode.PENDING_LOGIN]: AuthPendingLoginPayloadSchema,
    [OpCode.CANCEL]: AuthCancelPayloadSchema,
    [OpCode.UNKNOWN]: z.unknown()
};

export type AuthGatewayPayload =
    | AuthHelloPayload
    | AuthInitializePayload
    | AuthNonceProofReceivedPayload
    | AuthNonceProofRequestPayload
    | AuthPendingRemoteInitPayload
    | AuthHeartbeatPayload
    | AuthHeartbeatAckPayload
    | AuthPendingTicketPayload
    | AuthPendingLoginPayload
    | AuthCancelPayload

export function getAuthGatewayPayloadSchema(op: OpCode | typeof OpCode[keyof typeof OpCode]) {
    const opCode = opCodeFromValue(op);
    return mapAuthOpCodeToSchema[opCode];
}


export const MiniDiscordProfileSchema = z.object({
    id: z.string(),
    username: z.string(),
    discriminator: z.string(),
    avatar_hash: z.string().nullable(),
    avatar_url: z.string().nullable()
});
export type MiniDiscordProfile = z.infer<typeof MiniDiscordProfileSchema>;