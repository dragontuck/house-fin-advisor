# Deployment and Operations Guide

**Version**: 1.0  
**Date**: 2026-09-15  
**Audience**: Users self-hosting House Financial Advisor  
**Level**: Beginner-friendly (Docker experience helpful but not required)

---

## Part 1: Getting Started (15 minutes)

### Prerequisites

You'll need:
- A computer or home server (Mac, Linux, or Windows with Docker)
- Internet connection (for initial setup)
- ~50GB disk space for data
- ~4GB RAM (8GB recommended)

### Install Docker

House Financial Advisor runs in Docker (think of it as a standardized box that contains everything).

**Mac**: Download Docker Desktop for Mac  
**Linux**: `sudo apt-get install docker.io docker-compose` (Ubuntu/Debian)  
**Windows**: Download Docker Desktop for Windows

[Full Docker installation guide](https://docs.docker.com/install/)

### Run House Financial Advisor (One Command!)

1. **Download** the configuration file:
   ```bash
   curl https://advisor.local/docker-compose.yml > docker-compose.yml
   ```

2. **Start the system**:
   ```bash
   docker-compose up -d
   ```

3. **Open in your browser**:
   ```
   http://localhost:6173
   ```

4. **Create your first household**—done!

That's it. The system automatically:
- Downloads the application (first time only)
- Creates the database
- Sets up authentication
- Creates backups

### Check if It's Running

```bash
docker-compose ps
```

You should see:
```
NAME              STATUS
api               Up (healthy)
web               Up (healthy)  
postgres          Up (healthy)
redis             Up (healthy)
keycloak          Up (healthy)
```

If any show "Exited", see the Troubleshooting section.

---

## Part 2: Configuration (Optional)

### Default Setup

By default, House Financial Advisor is configured to work on your home network:

- **Database**: PostgreSQL (localhost, port 5434)
- **API**: http://localhost:6723
- **Web app**: http://localhost:6173
- **Backups**: Daily automatic backups to `./backups/`

### Customize (Optional)

Create a `.env` file in the same directory as `docker-compose.yml`:

```bash
# Database
POSTGRES_DB=house_financial
POSTGRES_USER=hf_admin
POSTGRES_PASSWORD=change_me_please

# API
API_PORT=6723
API_LOG_LEVEL=info

# Web
WEB_PORT=6173
WEB_LOG_LEVEL=info

# AI (Optional)
ANTHROPIC_API_KEY=your_key_here  # Only if using AI advisor
ANTHROPIC_MODEL=claude-3-sonnet

# Backup location
BACKUP_PATH=./backups
```

**Then restart**:
```bash
docker-compose down
docker-compose up -d
```

### Enable Remote Access (Advanced)

**SECURITY WARNING**: Only enable if you trust your network. Use VPN for remote access.

Edit `docker-compose.yml`:

Change API from:
```yaml
ports:
  - "127.0.0.1:6723:6723"
```

To:
```yaml
ports:
  - "0.0.0.0:6723:6723"
```

Same for web port and other services.

**Better approach**: Use a reverse proxy with HTTPS and authentication.

---

## Part 3: Daily Operations

### Starting the System

```bash
docker-compose up -d
```

Or if you want to see logs:

```bash
docker-compose up
```

(Press Ctrl+C to stop watching logs; system keeps running in background)

### Stopping the System

```bash
docker-compose down
```

This stops everything cleanly. Your data is safe (stored in database).

### Checking Health

```bash
docker-compose ps
```

Shows status of all services.

To check application logs:

```bash
docker-compose logs api        # API logs
docker-compose logs web        # Web app logs
docker-compose logs postgres   # Database logs
```

To see last 50 lines of API logs:

```bash
docker-compose logs -n 50 api
```

### Common Operations

**Restarting a service**:
```bash
docker-compose restart api
```

**Restarting everything**:
```bash
docker-compose down
docker-compose up -d
```

**Update to latest version**:
```bash
docker-compose down
docker-compose pull
docker-compose up -d
```

---

## Part 4: Backup and Recovery

### Automatic Backups

By default, the system backs up your database **every day at 2 AM**.

Backups are stored in `./backups/` directory.

**To check backups**:
```bash
ls -lh backups/
```

Example output:
```
house-fin-2026-09-14.sql.gz    2.3M
house-fin-2026-09-13.sql.gz    2.1M
house-fin-2026-09-12.sql.gz    2.0M
```

### Manual Backup (Anytime)

```bash
docker-compose exec postgres pg_dump -U hf_admin house_financial | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

This creates a backup file like `backup-20260915-143022.sql.gz`.

### Restore from Backup

If something goes wrong:

```bash
# Stop the system
docker-compose down

# Find your backup file
ls -lh backups/

# Restore (replace "FILENAME" with actual file)
docker-compose exec -T postgres psql -U hf_admin house_financial < backups/FILENAME

# Start the system
docker-compose up -d
```

**Example**:
```bash
docker-compose down
gunzip -c backups/house-fin-2026-09-14.sql.gz | docker-compose exec -T postgres psql -U hf_admin house_financial
docker-compose up -d
```

### Backup to External Drive (Recommended)

For extra safety, back up to an external drive or NAS:

**Linux/Mac**:
```bash
# Copy to external drive (monthly)
cp -r ./backups /mnt/external-drive/house-fin-backups-2026-09/
```

**Or sync to NAS**:
```bash
rsync -avz ./backups/ nas:/shared/house-fin-backups/
```

---

## Part 5: Security Hardening

### 1. Change Default Passwords

Edit `.env` file:

```bash
POSTGRES_PASSWORD=YourStrongPassword123!
KEYCLOAK_ADMIN_PASSWORD=YourStrongPassword456!
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### 2. Enable Disk Encryption (Linux)

**LUKS encryption** (Linux):
```bash
# Encrypt the data directory
sudo cryptsetup luksFormat /dev/sdX
sudo cryptsetup luksOpen /dev/sdX house-fin-data
sudo mkfs.ext4 /dev/mapper/house-fin-data
sudo mkdir -p /mnt/house-fin-data
sudo mount /dev/mapper/house-fin-data /mnt/house-fin-data
```

**BitLocker** (Windows):
1. Right-click drive
2. "Enable BitLocker"
3. Choose password
4. Wait for encryption

### 3. Firewall Rules

Allow only household members to access:

```bash
# Allow local network only
sudo ufw allow from 192.168.1.0/24 to any port 6173
sudo ufw allow from 192.168.1.0/24 to any port 6723

# Block everything else
sudo ufw default deny
```

### 4. VPN for Remote Access (Recommended)

Instead of exposing ports publicly, use VPN:

**WireGuard** (easiest):
1. Install WireGuard on home server
2. Install WireGuard client on your devices
3. Connect via VPN
4. Access http://localhost:6173 (over encrypted tunnel)

This way, no ports are exposed to internet.

### 5. Change Default Keys

In `docker-compose.yml`, look for `SECRET_KEY`. Change to random string:

```bash
# Generate random key
openssl rand -base64 32
```

Use output as `SECRET_KEY` in `.env`:
```bash
SECRET_KEY=your_random_generated_key
```

---

## Part 6: Monitoring and Alerts

### Basic Health Check

Monthly manual check:
```bash
docker-compose ps
docker-compose logs -n 100 api | grep -i error
```

### Monitoring Setup (Optional)

**Monitor disk space**:
```bash
# Check how much disk you're using
du -sh ./postgres-data
df -h
```

If approaching 50GB, consider:
- Archiving old transactions
- Adding more storage
- Moving backups to NAS

**Monitor logs for errors**:
```bash
# Check for errors in API logs
docker-compose logs api | grep -i error

# Check database logs
docker-compose logs postgres | grep -i error

# Check web logs
docker-compose logs web | grep -i error
```

### Email Alerts (Advanced)

Set up backup failure alerts:

```bash
#!/bin/bash
# backup-check.sh
BACKUP_TIME=$(date +%s -r ./backups/latest.sql.gz)
CURRENT_TIME=$(date +%s)
DIFF=$((CURRENT_TIME - BACKUP_TIME))

# If backup is older than 26 hours, alert
if [ $DIFF -gt 93600 ]; then
    echo "Backup failed - no recent backup" | mail -s "House Advisor Backup Alert" your-email@example.com
fi
```

Run via cron:
```bash
# Check every day at 3 AM
0 3 * * * /home/user/backup-check.sh
```

---

## Part 7: Scaling and Performance

### Single Household (Your Home)

Current setup handles perfectly:
- 1 household
- 20+ accounts
- 10K+ transactions
- Real-time calculations
- No performance issues

### Multiple Users (Remote Access)

If you want family members accessing from different locations:

Use VPN (see Security section) or managed hosting (coming 2027).

### Large Data (10K+ transactions)

If you have many years of transaction history:

```bash
# Archive old transactions (keep recent 2 years)
docker-compose exec postgres psql -U hf_admin house_financial << EOF
DELETE FROM transactions WHERE posted_at < NOW() - INTERVAL '2 years';
VACUUM;
EOF
```

### Database Optimization (Advanced)

If queries slow down:

```bash
# Rebuild indexes
docker-compose exec postgres psql -U hf_admin house_financial << EOF
REINDEX DATABASE house_financial;
VACUUM ANALYZE;
EOF
```

---

## Part 8: Troubleshooting

### Problem: "Connection refused" when opening app

**Solution**:
```bash
docker-compose ps
# Make sure all services show "Up"

docker-compose logs web
# Check for errors

docker-compose restart web
```

---

### Problem: "Database connection failed"

**Solution**:
```bash
docker-compose ps postgres
# Make sure postgres shows "Up (healthy)"

docker-compose logs postgres
# Look for error messages

# If still broken:
docker-compose down
docker-compose up -d
```

---

### Problem: "Out of disk space"

**Solution**:
```bash
df -h
# Check which drive is full

du -sh ./postgres-data ./backups
# See where data is

# If backups are full:
rm backups/old-*.sql.gz
# Delete old backups (keep last 5)

# If database is huge:
# Archive old data or upgrade disk
```

---

### Problem: "Browser won't load the app"

**Solution**:
```bash
# Check if web container is running
docker-compose logs web

# Try different port
# Edit docker-compose.yml, change WEB_PORT to 8000
# Restart: docker-compose down && docker-compose up -d
# Open http://localhost:8000
```

---

### Problem: "Performance is slow"

**Solution**:
```bash
# Check memory usage
docker stats

# Check if database needs optimization
docker-compose exec postgres psql -U hf_admin house_financial -c "SELECT * FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 5;"

# Rebuild indexes
docker-compose exec postgres psql -U hf_admin house_financial -c "REINDEX DATABASE house_financial;"
```

---

### Problem: "I can't access remotely over internet"

**Solution**:
- Don't expose ports to internet (security risk!)
- Use VPN instead (see Security section)
- Or wait for managed hosting (2027)

---

## Part 9: Maintenance Schedule

### Weekly
- Check `docker-compose ps` (make sure everything is "Up")
- Spot-check logs for errors: `docker-compose logs -n 50 api | grep -i error`

### Monthly
- Check disk usage: `du -sh ./postgres-data`
- Verify backup files exist: `ls -lh ./backups/ | head -10`
- Test restore procedure (monthly): `# Restore from a backup`
- Restart all services: `docker-compose down && docker-compose up -d`

### Quarterly (Every 3 months)
- Full backup test (restore to external drive)
- Update to latest version: `docker-compose pull && docker-compose down && docker-compose up -d`
- Optimize database: `REINDEX DATABASE house_financial`
- Review logs for patterns: `docker-compose logs api | tail -1000 | grep error`

### Annually
- Security review
- Disk cleanup (archive old backups)
- Capacity planning (do you need more storage?)
- Full data backup to external location

---

## Part 10: Updating to New Versions

### Check Current Version

```bash
docker-compose images
# Shows version of each service
```

### Update Safely

```bash
# 1. Backup current state
docker-compose exec postgres pg_dump -U hf_admin house_financial | gzip > pre-upgrade-$(date +%Y%m%d).sql.gz

# 2. Stop system
docker-compose down

# 3. Download latest versions
docker-compose pull

# 4. Start with new versions
docker-compose up -d

# 5. Check everything is working
docker-compose ps
docker-compose logs -n 20 api
```

### Rollback if Something Breaks

```bash
# Stop
docker-compose down

# Pull previous version (check release notes for tag)
docker-compose.yml  # Edit "image:" to specify previous version
# Example: image: advisor-api:0.9.0 (change from 1.0.0)

# Restore database
gunzip -c pre-upgrade-20260915.sql.gz | docker-compose exec -T postgres psql -U hf_admin house_financial

# Start
docker-compose up -d
```

---

## Part 11: Common Configuration Scenarios

### Scenario 1: Access from Spouse's Computer

**Setup VPN** (recommended):
1. Install WireGuard on home server
2. Create config for spouse's computer
3. Spouse connects to VPN
4. Access http://localhost:6173 (encrypted)

**Alternative (less secure)**:
Use nginx reverse proxy with HTTPS and password.

---

### Scenario 2: Nightly Backup to External NAS

In `.env`:
```bash
BACKUP_PATH=/mnt/nas/house-fin-backups
```

Mount NAS before starting:
```bash
sudo mount -t nfs nas.local:/shared /mnt/nas
docker-compose up -d
```

---

### Scenario 3: Run on Home Server (Not Desktop)

Setup similar but on server:

```bash
# On your home server (e.g., Synology, QNAP)
ssh user@homeserver.local
cd house-fin-advisor
docker-compose up -d

# From your desktop, access via VPN
# http://homeserver.local:6173 (over VPN)
```

---

## Part 12: Support and Help

### For Technical Help

- **Documentation**: https://docs.advisor.local
- **GitHub Issues**: https://github.com/house-fin-advisor/issues
- **Email**: support@advisor.local
- **Community**: community.advisor.local (coming 2027)

### For Docker-Specific Issues

- **Docker documentation**: https://docs.docker.com
- **Docker troubleshooting**: `docker --help`

### For Security Issues

- **Report security bug**: security@advisor.local (GPG-encrypted recommended)

---

## Part 13: Migration to Managed Hosting (Future)

When managed hosting launches (2027):

1. Export your data: **Settings → Export** (downloads all as JSON)
2. Sign up for managed hosting
3. Import your data
4. Your encryption key stays with you (zero-knowledge)

---

## Glossary

**Container**: A self-contained box with the app and dependencies (like a shipping container for software)

**Docker**: Software that runs containers (think of it as a container ship)

**Volume**: A data folder that persists even when containers restart

**Port**: A communication endpoint (6173 is where the web app talks to internet)

**Compose**: Docker Compose, a tool for running multiple containers together

**Backup**: A copy of your database (for recovery if something breaks)

**Restore**: Putting your data back from a backup

**Encryption**: Scrambling data so only you can read it

---

## Quick Reference

```bash
# Start system
docker-compose up -d

# Stop system
docker-compose down

# Check status
docker-compose ps

# View logs
docker-compose logs -n 50 api

# Backup
docker-compose exec postgres pg_dump -U hf_admin house_financial | gzip > backup.sql.gz

# Restore
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U hf_admin house_financial

# Restart a service
docker-compose restart api

# Update
docker-compose pull && docker-compose down && docker-compose up -d
```

---

**You're all set! House Financial Advisor is running securely on your own hardware.** 🏠💰

*For updates, visit: https://advisor.local*  
*Last Updated: 2026-09-15*
