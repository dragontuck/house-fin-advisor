# Infrastructure Migration: Docker Containers → Existing Shared Infrastructure

## Summary

This project has been updated to use existing shared infrastructure instead of Docker containers. This reduces setup complexity and maintenance overhead.

## Changes Made

### 1. Docker Compose Configuration
**File**: `docker-compose.yml`

- **Before**: Defined PostgreSQL, Redis, and Keycloak services
- **After**: Removed all services, configured to use existing infrastructure

**New docker-compose.yml:**
```yaml
# Uses existing infrastructure:
# - PostgreSQL: localhost:5434 (house_financial)
# - Redis: localhost:6379
# - Keycloak: keycloak.keystone.internal:7443

# No local containerized services
```

### 2. Integration Test Scripts
**Files**: `run-integration-tests.sh`, `run-integration-tests.bat`

**Changes:**
- ❌ Removed Docker service startup
- ❌ Removed docker-compose health checks
- ✅ Added existing infrastructure verification
- ✅ Only starts local development servers (API, Web)
- ✅ Verifies database access before running tests

**Linux/Mac Script Updates:**
```bash
# OLD: docker-compose up -d
# NEW: Verify infrastructure is accessible
```

**Windows Batch Script Updates:**
```batch
# OLD: docker-compose up -d
# NEW: Display infrastructure requirements
```

### 3. Documentation
**Files Updated:**
- `docs/INTEGRATION_TESTING.md` - Updated setup instructions
- `README.md` - Updated quick start and local development
- `docs/USING_EXISTING_INFRASTRUCTURE.md` - NEW: Complete infrastructure guide

**Key Changes:**
- Removed Docker prerequisites
- Updated setup instructions to use existing infrastructure
- Added infrastructure verification steps
- Added database migration instructions
- Added troubleshooting for infrastructure access

### 4. CI/CD Configuration
**File**: `docs/INTEGRATION_TESTING.md` (GitHub Actions section)

**Changes:**
- Removed PostgreSQL Docker service definition
- Added infrastructure access verification step
- Assumes CI/CD environment has access to shared infrastructure

## Infrastructure Requirements

### External Services (Existing)

| Service | Location | Purpose |
|---------|----------|---------|
| PostgreSQL | localhost:5434 | Financial data storage |
| Redis | localhost:6379 | Cache layer |
| Keycloak | keycloak.keystone.internal:7443 | OAuth/OIDC authentication (Slice 2+) |

### Local Development Services

| Service | Command | Purpose |
|---------|---------|---------|
| API Server | `cd apps/api && npm run dev` | REST API on port 3000 |
| Web Dev Server | `cd apps/web && npm run dev` | React app on port 5173 |

## Setup Instructions

### First Time Setup

1. **Verify infrastructure access:**
   ```bash
   psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"
   redis-cli -p 6379 ping
   ```

2. **Apply database migrations:**
   ```bash
   psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/001_initial_schema.sql
   psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/002_seed_tucker_household.sql
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

### Regular Development

```bash
# Terminal 1: Start API
cd apps/api && npm run dev

# Terminal 2: Start Web UI
cd apps/web && npm run dev

# Terminal 3: Run tests
cd apps/web && npm test e2e/integration.spec.ts
```

### Quick Integration Test

```bash
chmod +x run-integration-tests.sh
./run-integration-tests.sh
```

## Benefits

✅ **Simplified Setup**
- No Docker installation required
- Faster startup times
- No container overhead

✅ **Shared Infrastructure**
- Centralized database management
- Reduced duplication across projects
- Easier infrastructure upgrades

✅ **Development Flexibility**
- Can run multiple projects against same database
- Can modify infrastructure without affecting local config
- Better isolation between development and infrastructure

✅ **CI/CD Compatibility**
- No Docker-in-Docker complexity
- Faster CI/CD pipelines
- Better resource utilization

## Breaking Changes

⚠️ **What Changed:**
- ❌ `docker-compose up` no longer starts PostgreSQL, Redis, Keycloak
- ❌ Cannot run tests without existing infrastructure
- ❌ Database setup is manual (run migrations)

✅ **What Stayed the Same:**
- ✅ API and Web servers still work the same way
- ✅ Test suite is unchanged
- ✅ Database schema is unchanged
- ✅ Configuration files work the same way

## Migration Guide for Developers

### If You Were Using Docker:

**Before:**
```bash
docker-compose up              # Start all services
npm install                    # Install deps
# Tests automatically run with fresh database each time
npm test e2e/integration.spec.ts
```

**After:**
```bash
# Verify infrastructure (one-time)
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"

# Apply migrations (one-time)
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/001_initial_schema.sql

# Install and test
npm install
npm test e2e/integration.spec.ts
```

### Troubleshooting

If tests fail with "Connection refused":
1. Verify PostgreSQL is running: `psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"`
2. Verify Redis is running: `redis-cli -p 6379 ping`
3. Check firewall rules allow connections to 5434, 6379
4. See [USING_EXISTING_INFRASTRUCTURE.md](./docs/USING_EXISTING_INFRASTRUCTURE.md) for details

## Files Changed Summary

### Removed Docker Services
- ✅ PostgreSQL container definition
- ✅ Redis container definition
- ✅ Keycloak container definition
- ✅ Volume definitions for containers

### Updated Setup Scripts
- ✅ `run-integration-tests.sh` - Removed Docker, added infrastructure checks
- ✅ `run-integration-tests.bat` - Removed Docker, added infrastructure checks

### Updated Documentation
- ✅ `README.md` - Quick start and dev setup
- ✅ `docs/INTEGRATION_TESTING.md` - Setup and troubleshooting
- ✅ `docker-compose.yml` - Comments explaining infrastructure approach
- ✅ NEW: `docs/USING_EXISTING_INFRASTRUCTURE.md` - Complete infrastructure guide

### No Changes to Source Code
- ✅ `apps/api/src/` - No changes
- ✅ `apps/web/src/` - No changes
- ✅ `packages/` - No changes
- ✅ `tests/` - No changes

## Environment Configuration

### Default Configuration (Development)

```typescript
// Uses environment or defaults to existing infrastructure
DB_HOST = process.env.DB_HOST || 'localhost'
DB_PORT = process.env.DB_PORT || '5434'
DB_USER = process.env.DB_USER || 'hf_admin'
DB_PASSWORD = process.env.DB_PASSWORD || 'hf_admin'
DB_NAME = process.env.DB_NAME || 'house_financial'
```

### Override for Different Infrastructure

```bash
export DB_HOST=prod-postgres.example.com
export DB_PORT=5432
export DB_USER=prod_user
export DB_PASSWORD=prod_password
export DB_NAME=house_financial

npm run dev  # Uses production database
```

## Related Documentation

- 📖 [Using Existing Infrastructure](./docs/USING_EXISTING_INFRASTRUCTURE.md) - Complete guide
- 📖 [Integration Testing Guide](./docs/INTEGRATION_TESTING.md) - Setup and troubleshooting
- 📖 [README.md](./README.md) - Project overview
- 📖 [AGENTS.md](./AGENTS.md) - Development rules

## Questions & Support

1. **Can I still use Docker?** Yes, but you'll need to provide your own containers for PostgreSQL, Redis, and Keycloak.

2. **What if infrastructure is down?** Tests will fail with connection errors. Check infrastructure status with commands in [USING_EXISTING_INFRASTRUCTURE.md](./docs/USING_EXISTING_INFRASTRUCTURE.md).

3. **How do I reset the database?** Re-run the migrations after clearing the database with your admin tool.

4. **Can I use a different database?** Yes, update environment variables before running `npm run dev`.

---

**Status**: Infrastructure migration complete ✅
**Date**: August 12, 2026
**Impact**: Simplified setup, removed Docker dependency, no code changes
