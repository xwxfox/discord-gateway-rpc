export enum OpCode {
    HEARTBEAT = 'heartbeat',
    HEARTBEAT_ACK = 'heartbeat_ack',
    HELLO = 'hello',
    INIT = 'init',
    NONCE_PROOF = 'nonce_proof',
    PENDING_REMOTE_INIT = 'pending_remote_init',
    PENDING_TICKET = 'pending_ticket',
    PENDING_LOGIN = 'pending_login',
    CANCEL = 'cancel',
    UNKNOWN = 'unknown'
}

export function opCodeFromValue(value: typeof OpCode[keyof typeof OpCode]): OpCode {
    const values = Object.values(OpCode);
    if (values.includes(value)) {
        return value as OpCode;
    }
    return OpCode.UNKNOWN;
}
