-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create indexes for discord_accounts
CREATE INDEX IF NOT EXISTS idx_discord_accounts_user_id ON discord_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_accounts_discord_user_id ON discord_accounts(discord_user_id);

-- Create indexes for long_lived_tokens
CREATE INDEX IF NOT EXISTS idx_long_lived_tokens_user_id ON long_lived_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_long_lived_tokens_hash ON long_lived_tokens(token_hash);

-- Create indexes for user_settings
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create indexes for clients
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);
