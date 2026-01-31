# Database Setup

This directory contains the PostgreSQL database schema for the gateway application.

## Setting up PostgreSQL

### Option 1: Using Docker (Recommended)

```bash
# Create a Docker volume for persistent data
docker volume create paws-postgres-data

# Start PostgreSQL container
docker run -d \
  --name paws-postgres \
  -e POSTGRES_USER=paws \
  -e POSTGRES_PASSWORD=paws_password \
  -e POSTGRES_DB=detached_rpc \
  -p 5432:5432 \
  -v paws-postgres-data:/var/lib/postgresql/data \
  postgres:15

# Verify the container is running
docker ps | grep paws-postgres
```

### Option 2: Using System Package Manager

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
```

In the psql prompt:
```sql
CREATE USER paws WITH PASSWORD 'paws_password';
CREATE DATABASE detached_rpc OWNER paws;
\q
```

#### macOS (Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15

# Create database and user
psql postgres
```

In the psql prompt:
```sql
CREATE USER paws WITH PASSWORD 'paws_password';
CREATE DATABASE detached_rpc OWNER paws;
\q
```

#### Arch Linux
```bash
sudo pacman -S postgresql
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres createuser --interactive
sudo -u postgres createdb detached_rpc
```

## Running Migrations

### Option 1: Using psql
```bash
# Set environment variable
export DATABASE_URL="postgresql://paws:paws_password@localhost:5432/detached_rpc"

# Apply migrations in order
psql $DATABASE_URL -f apps/gateway/src/db/schema/001-create-tables.sql
psql $DATABASE_URL -f apps/gateway/src/db/schema/002-create-indexes.sql
```

### Option 2: Using node-postgres
```bash
# Set environment variable
export DATABASE_URL="postgresql://paws:paws_password@localhost:5432/detached_rpc"

# Apply migrations in order
psql $DATABASE_URL -f apps/gateway/src/db/schema/001-create-tables.sql
psql $DATABASE_URL -f apps/gateway/src/db/schema/002-create-indexes.sql
```

## Environment Variables

Required environment variable for the gateway application:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

Example:
```bash
DATABASE_URL=postgresql://paws:paws_password@localhost:5432/detached_rpc
```

## Verification

Connect to the database and verify tables were created:
```bash
psql $DATABASE_URL

# In psql
\dt
\d+ users
\d+ discord_accounts
\d+ long_lived_tokens
\d+ jwt_sessions
\d+ user_settings
\d+ clients
```

## Stopping PostgreSQL

### Docker
```bash
docker stop paws-postgres
```

### System service
```bash
# Ubuntu/Debian/Arch
sudo systemctl stop postgresql

# macOS
brew services stop postgresql@15
```
