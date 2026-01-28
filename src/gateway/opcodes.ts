export enum OpCode {
  DISPATCH = 0,
  HEARTBEAT = 1,
  IDENTIFY = 2,
  PRESENCE_UPDATE = 3,
  VOICE_STATE = 4,
  RESUME = 6,
  RECONNECT = 7,
  REQUEST_GUILD_MEMBERS = 8,
  INVALID_SESSION = 9,
  HELLO = 10,
  HEARTBEAT_ACK = 11,
  REQUEST_SOUNDBOARD_SOUNDS = 31,
  UNKNOWN = -1
}

export function opCodeFromValue(value: number): OpCode {
  const values = Object.values(OpCode);
  if (values.includes(value)) {
    return value as OpCode;
  }
  return OpCode.UNKNOWN;
}
