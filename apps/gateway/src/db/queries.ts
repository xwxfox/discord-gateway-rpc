import { getPool } from './pool.js';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

function validateUserId(userId: string): void {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId: must be a non-empty string');
  }
  const result = uuidSchema.safeParse(userId);
  if (!result.success) {
    throw new Error(`Invalid userId: must be a valid UUID, received: ${userId}`);
  }
}

function validateUsername(username: string): void {
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    throw new Error('Invalid username: must be a non-empty string');
  }
  if (username.length > 50) {
    throw new Error('Invalid username: must be 50 characters or less');
  }
}

function validateTokenHash(tokenHash: string): void {
  if (!tokenHash || typeof tokenHash !== 'string' || tokenHash.trim().length === 0) {
    throw new Error('Invalid tokenHash: must be a non-empty string');
  }
}

function validateStatus(status: string): void {
  if (!status || typeof status !== 'string' || status.trim().length === 0) {
    throw new Error('Invalid status: must be a non-empty string');
  }
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DiscordAccount {
  id: string;
  user_id: string;
  discord_user_id: string;
  username: string;
  discriminator: string | null;
  avatar_hash: string | null;
  token_encrypted: string;
  created_at: Date;
  updated_at: Date;
}

export interface LongLivedToken {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  last_used_at: Date | null;
}

export interface DiscordData {
  discord_user_id: string;
  username: string;
  discriminator?: string;
  avatar_hash?: string;
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  validateUsername(username);
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *',
    [username, passwordHash]
  );
  return result.rows[0];
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  validateUserId(userId);
  const pool = getPool();
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

export async function createLongLivedToken(userId: string, tokenHash: string): Promise<LongLivedToken> {
  validateUserId(userId);
  validateTokenHash(tokenHash);
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO long_lived_tokens (user_id, token_hash) VALUES ($1, $2) RETURNING *',
    [userId, tokenHash]
  );
  return result.rows[0];
}

export async function getLongLivedTokenByUserId(userId: string): Promise<LongLivedToken | null> {
  validateUserId(userId);
  const pool = getPool();
  const result = await pool.query('SELECT * FROM long_lived_tokens WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function updateLongLivedToken(userId: string, newTokenHash: string): Promise<LongLivedToken> {
  validateUserId(userId);
  validateTokenHash(newTokenHash);
  const pool = getPool();
  const result = await pool.query(
    'UPDATE long_lived_tokens SET token_hash = $1, last_used_at = NOW() WHERE user_id = $2 RETURNING *',
    [newTokenHash, userId]
  );
  if (result.rowCount === 0 || !result.rows[0]) {
    throw new Error(`Failed to update long lived token: user ${userId} not found`);
  }
  return result.rows[0];
}

export async function getDiscordAccount(userId: string): Promise<DiscordAccount | null> {
  validateUserId(userId);
  const pool = getPool();
  const result = await pool.query('SELECT * FROM discord_accounts WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function saveDiscordAccount(userId: string, encryptedToken: string, discordData: DiscordData): Promise<DiscordAccount> {
  validateUserId(userId);
  validateUsername(discordData.username);
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO discord_accounts (user_id, discord_user_id, username, discriminator, avatar_hash, token_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id)
     DO UPDATE SET
       discord_user_id = EXCLUDED.discord_user_id,
       username = EXCLUDED.username,
       discriminator = EXCLUDED.discriminator,
       avatar_hash = EXCLUDED.avatar_hash,
       token_encrypted = EXCLUDED.token_encrypted,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      discordData.discord_user_id,
      discordData.username,
      discordData.discriminator || null,
      discordData.avatar_hash || null,
      encryptedToken,
    ]
  );
  return result.rows[0];
}

export async function updateRpcStatus(userId: string, status: string): Promise<void> {
  validateUserId(userId);
  validateStatus(status);
  const pool = getPool();
  const result = await pool.query(
    'UPDATE user_settings SET rpc_status = $1, updated_at = NOW() WHERE user_id = $2',
    [status, userId]
  );
  if (result.rowCount === 0) {
    throw new Error(`Failed to update RPC status: user settings for user ${userId} not found`);
  }
}
