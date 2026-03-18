# Meridian - Production Deployment Guide

This guide covers deploying Meridian in a production environment using Docker Compose,
including infrastructure setup, security hardening, and operational best practices.

---

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Docker Compose Deployment](#2-docker-compose-deployment)
- [3. Environment Variables Reference](#3-environment-variables-reference)
- [4. Database Setup and Migrations](#4-database-setup-and-migrations)
- [5. Redis Configuration](#5-redis-configuration)
- [6. SSL/TLS Setup](#6-ssltls-setup)
- [7. Reverse Proxy (nginx)](#7-reverse-proxy-nginx)
- [8. Monitoring and Health Checks](#8-monitoring-and-health-checks)
- [9. Backup Strategy](#9-backup-strategy)
- [10. Scaling Considerations](#10-scaling-considerations)
- [11. Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 20 GB SSD | 50+ GB SSD |
| OS | Any Docker-compatible Linux | Ubuntu 22.04 / Debian 12 |

### Software Requirements

| Software | Minimum Version | Installation |
|----------|----------------|-------------|
| Docker | 24.0+ | https://docs.docker.com/engine/install/ |
| Docker Compose | 2.20+ | Included with Docker Desktop |
| openssl | Any | Pre-installed on most systems |

### Verify Installation

```bash
docker --version        # Docker version 24.0+
docker compose version  # Docker Compose version v2.20+
openssl version         # OpenSSL 3.x
```

---

## 2. Docker Compose Deployment

### Step 1: Clone the Repository

```bash
git clone https://github.com/meridian/meridian.git
cd meridian
```

### Step 2: Create Environment File

```bash
cp .env.example .env
```

### Step 3: Generate Secrets

```bash
# Generate JWT secret (required)
echo "JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')" >> .env

# Generate session secret (required)
echo "SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')" >> .env

# Set a strong PostgreSQL password
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')" >> .env

# Set a Redis password
echo "REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')" >> .env
```

### Step 4: Configure Environment

Edit `.env` with production values. At minimum, configure:

```env
# PostgreSQL
DATABASE_URL=postgresql://meridian:YOUR_STRONG_PASSWORD@postgres:5432/meridian
POSTGRES_USER=meridian
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD
POSTGRES_DB=meridian

# Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# API Server
PORT=3001
JWT_SECRET=YOUR_GENERATED_SECRET
LOG_LEVEL=info
CORS_ORIGIN=https://your-domain.com

# Frontend
WEB_PORT=80
VITE_API_URL=https://your-domain.com/api
VITE_WS_URL=wss://your-domain.com
```

### Step 5: Start All Services

```bash
docker compose up -d
```

This starts 5 services:
- **postgres**: PostgreSQL 16 metadata database
- **redis**: Redis 7 cache and job queue
- **server**: Fastify API server
- **worker**: BullMQ background job processor
- **web**: React frontend served via nginx

### Step 6: Verify Deployment

```bash
# Check all services are running
docker compose ps

# Check service logs
docker compose logs -f server
docker compose logs -f worker

# Test health endpoint
curl http://localhost:3001/health

# Test web frontend
curl -I http://localhost:80
```

### Step 7: Run Database Migrations

```bash
# Execute migrations inside the server container
docker compose exec server pnpm --filter @meridian/db migrate
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v
```

---

## 3. Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://meridian:pass@postgres:5432/meridian` |
| `POSTGRES_USER` | PostgreSQL username (for docker-compose) | `meridian` |
| `POSTGRES_PASSWORD` | PostgreSQL password | (generated) |
| `POSTGRES_DB` | PostgreSQL database name | `meridian` |
| `REDIS_URL` | Redis connection URL | `redis://:pass@redis:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | (generated with `openssl rand -base64 64`) |
| `PORT` | API server port | `3001` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | `https://your-domain.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_PASSWORD` | Redis auth password | (empty, no auth) |
| `LOG_LEVEL` | Log verbosity (`trace/debug/info/warn/error/fatal`) | `info` |
| `JWT_EXPIRY` | JWT token expiry duration | `7d` |
| `WEB_PORT` | Frontend port | `80` |
| `VITE_API_URL` | API URL for browser requests | `http://localhost:3001` |
| `VITE_WS_URL` | WebSocket URL for browser | `ws://localhost:3001` |
| `WORKER_CONCURRENCY` | Number of concurrent BullMQ workers | `5` |
| `SESSION_SECRET` | Session signing secret | (auto-generated) |

### SSO / OAuth (Optional)

| Variable | Description |
|----------|-------------|
| `OIDC_ISSUER` | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | OIDC client secret |
| `OIDC_CALLBACK_URL` | OAuth callback URL |
| `SAML_ENTRY_POINT` | SAML IdP entry point |
| `SAML_ISSUER` | SAML issuer |
| `SAML_CERT` | SAML IdP certificate |

### Email (Optional)

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `SMTP_FROM` | From address for emails |

### Storage (Optional)

| Variable | Description |
|----------|-------------|
| `STORAGE_TYPE` | Storage backend (`local` or `s3`) |
| `STORAGE_PATH` | Local filesystem path for exports |
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | S3 region |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_ENDPOINT` | S3-compatible endpoint (MinIO, R2) |

### AI / NL-to-SQL (Optional)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for NL-to-SQL |
| `OPENAI_MODEL` | OpenAI model (default: `gpt-4o`) |
| `ANTHROPIC_API_KEY` | Anthropic API key (alternative) |
| `ANTHROPIC_MODEL` | Anthropic model |

### Observability (Optional)

| Variable | Description |
|----------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint |
| `OTEL_SERVICE_NAME` | Service name for traces |
| `SENTRY_DSN` | Sentry error tracking DSN |

---

## 4. Database Setup and Migrations

### Initial Setup

PostgreSQL is automatically provisioned by Docker Compose with the credentials from
your `.env` file. The `postgres` service includes a health check that waits for the
database to be ready before other services start.

### Running Migrations

```bash
# Run pending migrations
docker compose exec server pnpm --filter @meridian/db migrate

# Generate new migration from schema changes
docker compose exec server pnpm --filter @meridian/db generate

# Open Drizzle Studio (database GUI) -- development only
docker compose exec server pnpm --filter @meridian/db studio
```

### Direct Database Access

```bash
# Connect to PostgreSQL via psql
docker compose exec postgres psql -U meridian -d meridian

# Common queries
\dt                          -- list tables
\d users                     -- describe users table
SELECT count(*) FROM users;  -- count users
```

### Database Maintenance

```bash
# Vacuum and analyze (run weekly via cron)
docker compose exec postgres psql -U meridian -d meridian -c "VACUUM ANALYZE;"

# Check database size
docker compose exec postgres psql -U meridian -d meridian -c "
  SELECT pg_size_pretty(pg_database_size('meridian'));
"

# Check table sizes
docker compose exec postgres psql -U meridian -d meridian -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
"
```

---

## 5. Redis Configuration

### Default Configuration

Redis runs with append-only file (AOF) persistence enabled by default via
the Docker Compose configuration.

### Security

If `REDIS_PASSWORD` is set, the Redis container automatically starts with
`--requirepass`. All clients (server, worker) include the password in their
connection URLs.

### Memory Limits

For production, set a memory limit to prevent Redis from consuming all available RAM:

```yaml
# In docker-compose.yml, under redis service:
deploy:
  resources:
    limits:
      memory: 1G
```

Or configure via Redis command:

```bash
docker compose exec redis redis-cli CONFIG SET maxmemory 1gb
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Monitoring Redis

```bash
# Check Redis info
docker compose exec redis redis-cli INFO

# Monitor real-time commands
docker compose exec redis redis-cli MONITOR

# Check memory usage
docker compose exec redis redis-cli INFO memory

# Check connected clients
docker compose exec redis redis-cli CLIENT LIST
```

---

## 6. SSL/TLS Setup

### Option A: Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificates are stored at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### Option B: Self-Signed Certificate (Development/Internal)

```bash
mkdir -p /etc/meridian/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/meridian/ssl/privkey.pem \
  -out /etc/meridian/ssl/fullchain.pem \
  -subj "/CN=your-domain.com"
```

### Mount Certificates in Docker Compose

Add to the `web` service in `docker-compose.yml`:

```yaml
web:
  volumes:
    - /etc/letsencrypt/live/your-domain.com/fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
    - /etc/letsencrypt/live/your-domain.com/privkey.pem:/etc/nginx/ssl/privkey.pem:ro
```

---

## 7. Reverse Proxy (nginx)

### Production nginx Configuration

The web application container includes nginx. For a full production setup,
use a configuration like the following:

```nginx
# /etc/nginx/conf.d/meridian.conf

upstream api_server {
    server server:3001;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Frontend static files
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy
    location /api/ {
        proxy_pass http://api_server;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running queries
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://api_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket timeout (keep connections alive)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check (no auth required)
    location /health {
        proxy_pass http://api_server/health;
        access_log off;
    }
}
```

---

## 8. Monitoring and Health Checks

### Health Check Endpoint

The API server exposes a health check at `GET /health`:

```bash
curl http://localhost:3001/health
```

Docker Compose is configured to use this endpoint for container health monitoring:

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### Container Health Status

```bash
# Check health status of all containers
docker compose ps

# View health check logs
docker inspect --format='{{json .State.Health}}' meridian-server-1 | jq
```

### Log Aggregation

Meridian uses structured JSON logging. Collect logs with your preferred stack:

```bash
# View real-time logs
docker compose logs -f

# View specific service logs
docker compose logs -f server --since 1h

# Export logs to file
docker compose logs server > server.log 2>&1
```

### Key Metrics to Monitor

| Metric | Source | Warning Threshold |
|--------|--------|-------------------|
| API response time (p95) | Server logs | > 500ms |
| WebSocket connections | Server metrics | > 1000 per instance |
| Redis memory usage | `redis-cli INFO memory` | > 80% of maxmemory |
| PostgreSQL connections | `pg_stat_activity` | > 80% of max_connections |
| Queue depth | BullMQ metrics | > 100 pending jobs |
| Cache hit ratio | Cache metrics | < 70% |
| Error rate (5xx) | Server logs | > 1% |
| Disk usage | System metrics | > 85% |

---

## 9. Backup Strategy

### PostgreSQL Backups

#### Automated Daily Backups

```bash
#!/bin/bash
# /etc/cron.daily/meridian-backup.sh

BACKUP_DIR="/backups/meridian/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Create compressed backup
docker compose exec -T postgres pg_dump -U meridian meridian \
  | gzip > "$BACKUP_DIR/meridian_${TIMESTAMP}.sql.gz"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed: meridian_${TIMESTAMP}.sql.gz"
```

#### Restore from Backup

```bash
# Stop the server and worker
docker compose stop server worker

# Restore backup
gunzip -c /backups/meridian/postgres/meridian_20260317_120000.sql.gz \
  | docker compose exec -T postgres psql -U meridian -d meridian

# Restart services
docker compose start server worker
```

### Redis Backups

Redis uses AOF persistence by default. For additional safety:

```bash
# Trigger RDB snapshot
docker compose exec redis redis-cli BGSAVE

# Copy RDB file
docker compose exec redis cat /data/dump.rdb > /backups/meridian/redis/dump_$(date +%Y%m%d).rdb
```

### Volume Backups

```bash
# Backup Docker volumes
docker run --rm \
  -v meridian_postgres_data:/data \
  -v /backups/meridian:/backup \
  alpine tar czf /backup/postgres_volume_$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v meridian_redis_data:/data \
  -v /backups/meridian:/backup \
  alpine tar czf /backup/redis_volume_$(date +%Y%m%d).tar.gz /data
```

---

## 10. Scaling Considerations

### Horizontal Scaling

#### API Server

The Fastify API server is stateless (JWT-based auth, no server-side sessions).
Scale by running multiple instances behind a load balancer:

```yaml
# docker-compose.override.yml
services:
  server:
    deploy:
      replicas: 3
```

Ensure `CORS_ORIGIN` and `JWT_SECRET` are identical across all instances.

#### Workers

Scale BullMQ workers independently based on job volume:

```yaml
services:
  worker:
    deploy:
      replicas: 3
    environment:
      WORKER_CONCURRENCY: 5  # 5 concurrent jobs per worker = 15 total
```

#### WebSocket Considerations

When running multiple server instances, WebSocket clients connect to a single
instance. For broadcasting across instances, use Redis Pub/Sub (the `@meridian/realtime`
package supports this pattern).

### Vertical Scaling

| Component | Scaling Lever | When to Scale |
|-----------|--------------|---------------|
| PostgreSQL | RAM (shared_buffers), CPU | Slow queries, high connection count |
| Redis | RAM (maxmemory) | Cache eviction rate high |
| Server | CPU, RAM | High API latency |
| Worker | CPU | Job queue growing |

### PostgreSQL Tuning

For production workloads, adjust these PostgreSQL settings:

```sql
-- In postgresql.conf or via environment
ALTER SYSTEM SET shared_buffers = '1GB';          -- 25% of RAM
ALTER SYSTEM SET effective_cache_size = '3GB';     -- 75% of RAM
ALTER SYSTEM SET work_mem = '64MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET random_page_cost = 1.1;           -- for SSD
```

### Connection Pooling

For high-concurrency deployments, add PgBouncer between the server and PostgreSQL:

```yaml
services:
  pgbouncer:
    image: edoburu/pgbouncer
    environment:
      DATABASE_URL: postgresql://meridian:pass@postgres:5432/meridian
      POOL_MODE: transaction
      MAX_DB_CONNECTIONS: 100
      DEFAULT_POOL_SIZE: 20
    ports:
      - "6432:6432"
```

Update `DATABASE_URL` to point to PgBouncer instead of PostgreSQL directly.

---

## 11. Troubleshooting

### Common Issues

#### Services Fail to Start

```bash
# Check container logs
docker compose logs server
docker compose logs worker

# Check if PostgreSQL is ready
docker compose exec postgres pg_isready -U meridian

# Check if Redis is ready
docker compose exec redis redis-cli ping
```

#### Database Connection Errors

```bash
# Verify DATABASE_URL format
echo $DATABASE_URL

# Test connection from server container
docker compose exec server node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect().then(() => { console.log('OK'); c.end(); }).catch(console.error);
"
```

#### Redis Connection Errors

```bash
# Test Redis connectivity
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" ping

# Check Redis logs
docker compose logs redis
```

#### High Memory Usage

```bash
# Check container resource usage
docker stats

# Check Redis memory
docker compose exec redis redis-cli INFO memory

# Check PostgreSQL connections
docker compose exec postgres psql -U meridian -c "
  SELECT count(*) FROM pg_stat_activity;
"
```

#### WebSocket Connection Drops

- Verify nginx WebSocket proxy configuration (Upgrade headers)
- Check `proxy_read_timeout` is set to a high value (3600s)
- Verify `VITE_WS_URL` uses `wss://` in production

#### Slow Query Performance

```bash
# Check PostgreSQL slow queries
docker compose exec postgres psql -U meridian -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY duration DESC
  LIMIT 5;
"

# Check Redis cache hit ratio
docker compose exec redis redis-cli INFO stats | grep keyspace
```
