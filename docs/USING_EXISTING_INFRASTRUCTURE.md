# Using Existing Infrastructure

This project uses shared existing infrastructure instead of Docker containers. This document explains how to access and verify the existing services.

## Infrastructure Overview

### PostgreSQL Database
```
Host:     localhost
Port:     5434
Database: house_financial
User:     hf_admin
Password: hf_admin
```

**Connection string:**
```
postgresql://hf_admin:hf_admin@localhost:5434/house_financial
```

**Verify connection:**
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"
```

### Redis Cache
```
Host: localhost
Port: 6379
```

**Verify connection:**
```bash
redis-cli -p 6379 ping
# Should return: PONG
```

### Keycloak Auth Server
```
URL:   https://keycloak.keystone.internal:7443/
Realm: house-fin
```

**Verify connection:**
```bash
curl -k https://keycloak.keystone.internal:7443/health/ready
# Should return: {"status":"UP"}
```

## Database Migrations

The database schema and seed data are defined in SQL files. You may need to manually run migrations if they haven't been applied yet.

### Apply Migrations

```bash
# 1. Create the database schema
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/001_initial_schema.sql

# 2. Seed the development data
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/002_seed_tucker_household.sql

# 3. Verify migrations ran
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "\dt"
```

**Expected tables:**
- `households`
- `household_members`
- `accounts`
- `financial_snapshots`

### Verify Seeded Data

```bash
# Check household
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT id, name FROM households"

# Check accounts
psql -h localhost -p 5434 -U hf_admin -d house_financial -c \
  "SELECT name, account_type, current_balance_cents FROM accounts WHERE household_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'"

# Check members
psql -h localhost -p 5434 -U hf_admin -d house_financial -c \
  "SELECT first_name, role FROM household_members WHERE household_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'"
```

**Expected data (Tucker Household):**
- Household: "Tucker Household" (ID: `f47ac10b-58cc-4372-a567-0e02b2c3d479`)
- Members:
  - Sean (role: OWNER)
  - Wife (role: MEMBER)
- Accounts:
  - Checking: $7,200 (720,000 cents)
  - Savings: $12,000 (1,200,000 cents)
  - 401(k): $325,000 (32,500,000 cents)
  - IRA: $85,000 (8,500,000 cents)
  - Mortgage: -$240,000 (-24,000,000 cents)

## Troubleshooting

### PostgreSQL Connection Fails

**Symptom:**
```
psql: error: could not translate host name "localhost" to address: ...
```

**Solution:**
- PostgreSQL is not running or not accessible on port 5434
- Verify with: `netstat -an | grep 5434` (Windows) or `lsof -i :5434` (Mac/Linux)
- Check PostgreSQL logs for errors
- Verify firewall allows connections to port 5434

### Database Tables Missing

**Symptom:**
```
psql: error: relation "households" does not exist
```

**Solution:**
- Run migrations manually (see "Apply Migrations" above)
- Verify migrations ran: `psql ... -c "\dt"`
- Check for SQL errors in migration files

### Seeded Data Missing

**Symptom:**
```
(0 rows)
```

**Solution:**
- Run seed migration: `psql ... < packages/db/migrations/002_seed_tucker_household.sql`
- Verify: `psql ... -c "SELECT COUNT(*) FROM households"`
- Check for SQL errors in seed file

### Redis Connection Fails

**Symptom:**
```
Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Solution:**
- Redis is not running or not accessible on port 6379
- Verify with: `redis-cli -p 6379 ping`
- Start Redis if needed
- Check firewall allows connections to port 6379

### Keycloak Connection Fails

**Symptom:**
```
curl: (60) SSL certificate problem: self signed certificate
```

**Solution:**
- Use `-k` flag to skip SSL verification (for development):
  ```bash
  curl -k https://keycloak.keystone.internal:7443/health/ready
  ```
- Add certificate to trusted store for production

### Host Resolution Fails

**Symptom:**
```
curl: (6) Could not resolve host: keycloak.keystone.internal
```

**Solution:**
- Add hostname to `/etc/hosts` (Linux/Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
  ```
  127.0.0.1 keycloak.keystone.internal
  ```
- Or update your network configuration to resolve the hostname

## Working with the Database

### Connect with psql

```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial
```

**Useful commands inside psql:**
```sql
-- List tables
\dt

-- Show table schema
\d households

-- Query data
SELECT * FROM households;

-- Exit
\q
```

### Connect with GUI Tools

**DBeaver:**
1. New Database Connection
2. PostgreSQL
3. Host: `localhost`, Port: `5434`
4. Username: `hf_admin`, Password: `hf_admin`
5. Database: `house_financial`

**pgAdmin:**
1. Create Server
2. Host: `localhost:5434`
3. Username: `hf_admin`
4. Password: `hf_admin`
5. Database: `house_financial`

### Backup and Restore

**Backup database:**
```bash
pg_dump -h localhost -p 5434 -U hf_admin -d house_financial > backup.sql
```

**Restore database:**
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial < backup.sql
```

## Environment-Specific Configuration

### Development (Local)
```
PostgreSQL: localhost:5434
Redis:      localhost:6379
Keycloak:   keycloak.keystone.internal:7443
```

### CI/CD (GitHub Actions)
Must have access to the same infrastructure endpoints.

### Production
Update connection strings in environment configuration:
```bash
export DB_HOST=production-postgres.example.com
export DB_PORT=5432
export DB_USER=hf_admin
export DB_PASSWORD=<secure password>
export DB_NAME=house_financial
```

## Configuration in Code

The API server reads these environment variables (with defaults):

```typescript
// apps/api/src/server.ts
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5434');
const DB_USER = process.env.DB_USER || 'hf_admin';
const DB_PASSWORD = process.env.DB_PASSWORD || 'hf_admin';
const DB_NAME = process.env.DB_NAME || 'house_financial';
```

To use different infrastructure, set environment variables:

```bash
export DB_HOST=your-postgres-server
export DB_PORT=5432
export DB_USER=your-user
export DB_PASSWORD=your-password

npm run dev  # API will use configured database
```

## Maintenance

### Monitoring Database Health

```bash
# Check connection count
psql -h localhost -p 5434 -U hf_admin -d house_financial -c \
  "SELECT count(*) as connection_count FROM pg_stat_activity;"

# Check table sizes
psql -h localhost -p 5434 -U hf_admin -d house_financial -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### Monitoring Redis Health

```bash
# Get Redis info
redis-cli -p 6379 info

# Check memory usage
redis-cli -p 6379 info memory

# Monitor commands in real-time
redis-cli -p 6379 monitor
```

## Support

For issues with existing infrastructure:
1. Check infrastructure service logs
2. Verify network connectivity
3. Verify authentication credentials
4. Check firewall rules
5. Consult infrastructure team for shared services

For project-specific issues:
1. Review [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md)
2. Check [AGENTS.md](../AGENTS.md) for development rules
3. Review database migrations in `packages/db/migrations/`
