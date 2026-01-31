import { getPool } from './pool.js';

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

export interface JwtSession {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
}

export interface UserSettings {
  id: string;
  user_id: string;
  rpc_enabled: boolean;
  rpc_status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Client {
  id: string;
  user_id: string;
  client_id: string | null;
  device_type: string | null;
  device_info: unknown;
  last_seen_at: Date;
  connected: boolean;
}

export interface DiscordData {
  discord_user_id: string;
  username: string;
  discriminator?: string;
  avatar_hash?: string;
}

export async function createUser(username: string, passwordHash: string, email?: string): Promise<User> {
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING *',
    [username, passwordHash, email || null]
  );
  return result.rows[0];
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

export async function createLongLivedToken(userId: string, tokenHash: string): Promise<LongLivedToken> {
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO long_lived_tokens (user_id, token_hash) VALUES ($1, $2) RETURNING *',
    [userId, tokenHash]
  );
  return result.rows[0];
}

export async function getLongLivedTokenByUserId(userId: string): Promise<LongLivedToken | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM long_lived_tokens WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function getLongLivedTokenByHash(tokenHash: string): Promise<LongLivedToken | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM long_lived_tokens WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

export async function updateLongLivedToken(userId: string, newTokenHash: string): Promise<LongLivedToken> {
  const pool = getPool();
  const result = await pool.query(
    'UPDATE long_lived_tokens SET token_hash = $1, last_used_at = NOW() WHERE user_id = $2 RETURNING *',
    [newTokenHash, userId]
  );
  return result.rows[0];
}

export async function updateTokenLastUsed(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE long_lived_tokens SET last_used_at = NOW() WHERE token_hash = $1', [tokenHash]);
}

export async function getDiscordAccount(userId: string): Promise<DiscordAccount | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM discord_accounts WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function getDiscordAccountByDiscordId(discordUserId: string): Promise<DiscordAccount | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM discord_accounts WHERE discord_user_id = $1', [discordUserId]);
  return result.rows[0] || null;
}

export async function saveDiscordAccount(userId: string, encryptedToken: string, discordData: DiscordData): Promise<DiscordAccount> {
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
  const pool = getPool();
  await pool.query(
    'UPDATE user_settings SET rpc_status = $1, updated_at = NOW() WHERE user_id = $2',
    [status, userId]
  );
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function updateUserSettings(userId: string, settings: Partial<{ rpc_enabled: boolean; rpc_status: string }>): Promise<UserSettings> {
  const pool = getPool();
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (settings.rpc_enabled !== undefined) {
    updates.push(`rpc_enabled = $${paramIndex}`);
    values.push(settings.rpc_enabled);
    paramIndex++;
  }

  if (settings.rpc_status !== undefined) {
    updates.push(`rpc_status = $${paramIndex}`);
    values.push(settings.rpc_status);
    paramIndex++;
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const query = `
    INSERT INTO user_settings (user_id, rpc_enabled, rpc_status)
    VALUES ($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})
    ON CONFLICT (user_id)
    DO UPDATE SET ${updates.join(', ')}
    RETURNING *
  `;

  const defaultValues = [userId, settings.rpc_enabled ?? true, settings.rpc_status ?? 'stopped'];
  const allValues = values.length > 3 ? values : defaultValues;

  const result = await pool.query(query, allValues);
  return result.rows[0];
}

export async function createJwtSession(userId: string, tokenHash: string, expiresAt: Date): Promise<JwtSession> {
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO jwt_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING *',
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

export async function getJwtSession(tokenHash: string): Promise<JwtSession | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM jwt_sessions WHERE token_hash = $1 AND expires_at > NOW()',
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function deleteJwtSession(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM jwt_sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteAllJwtSessions(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM jwt_sessions WHERE user_id = $1', [userId]);
}

export async function createClient(
  userId: string,
  clientId: string | null,
  deviceType: string | null,
  deviceInfo: unknown
): Promise<Client> {
  const pool = getPool();
  const result = await pool.query(
    'INSERT INTO clients (user_id, client_id, device_type, device_info) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, clientId, deviceType, JSON.stringify(deviceInfo)]
  );
  return result.rows[0];
}

export async function getClient(clientId: string): Promise<Client | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM clients WHERE client_id = $1', [clientId]);
  return result.rows[0] || null;
}

export async function getClientsByUser(userId: string): Promise<Client[]> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM clients WHERE user_id = $1 ORDER BY last_seen_at DESC', [userId]);
  return result.rows;
}

export async function updateClientLastSeen(clientId: string): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE clients SET last_seen_at = NOW() WHERE client_id = $1', [clientId]);
}

export async function setClientConnected(clientId: string, connected: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE clients SET connected = $1, last_seen_at = NOW() WHERE client_id = $2', [connected, clientId]);
}

export async function deleteClient(clientId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM clients WHERE client_id = $1', [clientId]);
}

export async function deleteAllClients(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM clients WHERE user_id = $1', [userId]);
}
