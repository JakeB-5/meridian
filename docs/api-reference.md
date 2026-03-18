# Meridian - API Reference

Complete REST API reference for the Meridian BI platform.

**Base URL**: `http://localhost:3001/api`

---

## Table of Contents

- [Request/Response Format](#requestresponse-format)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Auth](#auth-endpoints)
  - [Data Sources](#data-source-endpoints)
  - [Questions](#question-endpoints)
  - [Dashboards](#dashboard-endpoints)
  - [Users](#user-endpoints)
  - [Plugins](#plugin-endpoints)
  - [Embed](#embed-endpoints)
  - [Export](#export-endpoints)
  - [Admin](#admin-endpoints)
  - [Semantic Layer](#semantic-layer-endpoints)
- [Error Codes Reference](#error-codes-reference)
- [Pagination](#pagination)
- [Rate Limiting](#rate-limiting)

---

## Request/Response Format

### Envelope Pattern

All API responses use a consistent envelope format.

**Success Response**:

```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-17T12:00:00.000Z"
  }
}
```

**Error Response**:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Dashboard not found",
    "details": {}
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-17T12:00:00.000Z"
  }
}
```

**List Response** (with pagination):

```json
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "requestId": "...",
    "timestamp": "...",
    "pagination": {
      "total": 42,
      "limit": 25,
      "offset": 0
    }
  }
}
```

### Content Type

All requests and responses use `application/json` unless otherwise noted
(e.g., export endpoints may return `text/csv` or `application/pdf`).

### Authentication Header

Protected endpoints require a Bearer token:

```
Authorization: Bearer <access_token>
```

---

## Authentication

All endpoints except those in the Auth section require a valid JWT access token.

Obtain tokens via `POST /api/auth/login` or `POST /api/auth/register`.

---

## Endpoints

### Auth Endpoints

#### POST /api/auth/register

Create a new user account.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "name": "Jane Doe",
  "organizationName": "Acme Corp"
}
```

**Response** (201):

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "user@example.com",
      "name": "Jane Doe",
      "organizationId": "org_xyz789",
      "role": "admin",
      "status": "active",
      "createdAt": "2026-03-17T12:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "accessTokenExpiresAt": 1710676800000,
      "refreshTokenExpiresAt": 1711281600000
    }
  }
}
```

**Errors**: `CONFLICT` (email already exists), `VALIDATION_ERROR` (weak password)

---

#### POST /api/auth/login

Authenticate with email and password.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "user": { ... },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "accessTokenExpiresAt": 1710676800000,
      "refreshTokenExpiresAt": 1711281600000
    }
  }
}
```

**Errors**: `UNAUTHORIZED` (invalid credentials), `FORBIDDEN` (account deactivated)

---

#### POST /api/auth/refresh

Refresh an expired access token using a valid refresh token.

**Request Body**:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "accessTokenExpiresAt": 1710676800000,
    "refreshTokenExpiresAt": 1711281600000
  }
}
```

**Errors**: `UNAUTHORIZED` (invalid or expired refresh token)

---

#### POST /api/auth/logout

Invalidate the current session. Requires authentication.

**Response** (200):

```json
{
  "ok": true,
  "data": { "message": "Logged out successfully" }
}
```

---

#### GET /api/auth/me

Get the currently authenticated user's profile.

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "Jane Doe",
    "avatarUrl": "https://...",
    "organizationId": "org_xyz789",
    "role": {
      "id": "role_admin",
      "name": "admin",
      "permissions": ["dashboard:read", "dashboard:write", "datasource:admin", ...]
    },
    "status": "active",
    "lastLoginAt": "2026-03-17T12:00:00.000Z",
    "createdAt": "2026-03-01T00:00:00.000Z"
  }
}
```

---

### Data Source Endpoints

#### POST /api/datasources

Create a new data source connection.

**Required Permission**: `datasource:write`

**Request Body**:

```json
{
  "name": "Production PostgreSQL",
  "type": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "database": "analytics",
  "username": "reader",
  "password": "secret",
  "ssl": true,
  "options": {}
}
```

**Supported types**: `postgresql`, `mysql`, `sqlite`, `clickhouse`, `duckdb`, `bigquery`, `snowflake`

**Response** (201):

```json
{
  "ok": true,
  "data": {
    "id": "ds_abc123",
    "name": "Production PostgreSQL",
    "type": "postgresql",
    "host": "db.example.com",
    "port": 5432,
    "database": "analytics",
    "status": "connected",
    "organizationId": "org_xyz789",
    "createdAt": "2026-03-17T12:00:00.000Z",
    "updatedAt": "2026-03-17T12:00:00.000Z"
  }
}
```

**Errors**: `CONFLICT` (name exists), `VALIDATION_ERROR`

---

#### GET /api/datasources

List all data sources for the current organization.

**Required Permission**: `datasource:read`

**Response** (200):

```json
{
  "ok": true,
  "data": [
    {
      "id": "ds_abc123",
      "name": "Production PostgreSQL",
      "type": "postgresql",
      "status": "connected",
      ...
    }
  ]
}
```

---

#### GET /api/datasources/:id

Get a specific data source. Credentials are masked in the response.

**Required Permission**: `datasource:read`

---

#### PUT /api/datasources/:id

Update a data source configuration.

**Required Permission**: `datasource:write`

---

#### DELETE /api/datasources/:id

Delete a data source. Fails if questions reference this source.

**Required Permission**: `datasource:admin`

---

#### POST /api/datasources/:id/test

Test data source connectivity.

**Required Permission**: `datasource:write`

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "success": true,
    "message": "Connection successful",
    "latencyMs": 42
  }
}
```

---

#### GET /api/datasources/:id/schema

Get database schema (schemas, tables, columns) for introspection.

**Required Permission**: `datasource:read`

**Response** (200):

```json
{
  "ok": true,
  "data": [
    {
      "name": "public",
      "tables": [
        {
          "name": "orders",
          "columns": [
            { "name": "id", "type": "integer", "nullable": false },
            { "name": "customer_id", "type": "integer", "nullable": false },
            { "name": "total", "type": "numeric(10,2)", "nullable": false },
            { "name": "created_at", "type": "timestamp", "nullable": false }
          ]
        }
      ]
    }
  ]
}
```

---

#### GET /api/datasources/:id/tables

Get a flat list of tables from the data source.

**Required Permission**: `datasource:read`

---

### Question Endpoints

#### POST /api/questions

Create a new question (visual or SQL).

**Required Permission**: `question:write`

**Request Body (Visual Query)**:

```json
{
  "name": "Monthly Revenue",
  "description": "Total revenue by month",
  "type": "visual",
  "dataSourceId": "ds_abc123",
  "query": {
    "table": "orders",
    "measures": [{ "field": "total", "aggregation": "sum", "alias": "revenue" }],
    "dimensions": [{ "field": "created_at", "granularity": "month" }],
    "filters": [],
    "orderBy": [{ "field": "created_at", "direction": "asc" }],
    "limit": 12
  },
  "visualization": {
    "type": "line",
    "config": {
      "xAxis": "created_at",
      "yAxis": "revenue"
    }
  }
}
```

**Request Body (SQL Query)**:

```json
{
  "name": "Custom SQL Report",
  "type": "sql",
  "dataSourceId": "ds_abc123",
  "sql": "SELECT date_trunc('month', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1 ORDER BY 1",
  "visualization": {
    "type": "bar",
    "config": {}
  }
}
```

---

#### GET /api/questions

List questions with optional filters.

**Required Permission**: `question:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `dataSourceId` | string | Filter by data source |
| `type` | string | Filter by type (`visual` or `sql`) |
| `createdBy` | string | Filter by creator |
| `collectionId` | string | Filter by collection |
| `search` | string | Full-text search in name and description |
| `limit` | number | Results per page (default: 25, max: 100) |
| `offset` | number | Pagination offset |

---

#### GET /api/questions/:id

Get a specific question with its definition and cached results.

**Required Permission**: `question:read`

---

#### PUT /api/questions/:id

Update a question's metadata, query, or visualization.

**Required Permission**: `question:write`

---

#### DELETE /api/questions/:id

Delete a question. Removes from any dashboards referencing it.

**Required Permission**: `question:write`

---

#### POST /api/questions/:id/execute

Execute the question's query and return fresh results.

**Required Permission**: `question:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `refresh` | boolean | Bypass cache and re-execute (default: false) |

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "columns": [
      { "name": "month", "type": "timestamp" },
      { "name": "revenue", "type": "number" }
    ],
    "rows": [
      ["2026-01-01T00:00:00Z", 125000],
      ["2026-02-01T00:00:00Z", 142000],
      ["2026-03-01T00:00:00Z", 138000]
    ],
    "rowCount": 3,
    "executionTimeMs": 127,
    "cached": false,
    "cacheExpiresAt": "2026-03-17T13:00:00.000Z"
  }
}
```

---

#### POST /api/questions/:id/preview

Preview query results with a limited row count (useful for query builder).

**Required Permission**: `question:read`

---

#### POST /api/questions/:id/duplicate

Duplicate a question with a new name.

**Required Permission**: `question:write`

**Request Body**:

```json
{
  "name": "Monthly Revenue (Copy)"
}
```

---

### Dashboard Endpoints

#### POST /api/dashboards

Create a new dashboard.

**Required Permission**: `dashboard:write`

**Request Body**:

```json
{
  "name": "Sales Overview",
  "description": "Key sales metrics and trends",
  "isPublic": false,
  "layout": {
    "columns": 12,
    "rowHeight": 80,
    "gap": 16
  }
}
```

---

#### GET /api/dashboards

List dashboards with optional filters.

**Required Permission**: `dashboard:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `createdBy` | string | Filter by creator |
| `isPublic` | boolean | Filter by visibility |
| `search` | string | Search in name and description |
| `limit` | number | Results per page (default: 25) |
| `offset` | number | Pagination offset |

---

#### GET /api/dashboards/:id

Get a dashboard with all cards, filters, and layout.

**Required Permission**: `dashboard:read`

---

#### PUT /api/dashboards/:id

Update dashboard metadata (name, description, visibility).

**Required Permission**: `dashboard:write`

---

#### DELETE /api/dashboards/:id

Delete a dashboard and all its cards.

**Required Permission**: `dashboard:write`

---

#### POST /api/dashboards/:id/cards

Add a card (question visualization) to a dashboard.

**Required Permission**: `dashboard:write`

**Request Body**:

```json
{
  "questionId": "q_abc123",
  "position": { "x": 0, "y": 0 },
  "size": { "w": 6, "h": 4 },
  "title": "Monthly Revenue"
}
```

---

#### DELETE /api/dashboards/:id/cards/:cardId

Remove a card from a dashboard.

**Required Permission**: `dashboard:write`

---

#### PUT /api/dashboards/:id/cards/:cardId/position

Move or resize a card within the dashboard.

**Required Permission**: `dashboard:write`

**Request Body**:

```json
{
  "position": { "x": 6, "y": 0 },
  "size": { "w": 6, "h": 4 }
}
```

---

#### PUT /api/dashboards/:id/layout

Update the dashboard grid layout.

**Required Permission**: `dashboard:write`

---

#### PUT /api/dashboards/:id/reorder

Reorder cards within the dashboard.

**Required Permission**: `dashboard:write`

**Request Body**:

```json
{
  "cardIds": ["card_1", "card_3", "card_2"]
}
```

---

#### POST /api/dashboards/:id/filters

Add a dynamic filter to the dashboard.

**Required Permission**: `dashboard:write`

**Request Body**:

```json
{
  "name": "Date Range",
  "type": "date_range",
  "targetQuestionIds": ["q_abc123", "q_def456"],
  "field": "created_at",
  "defaultValue": { "start": "2026-01-01", "end": "2026-12-31" }
}
```

---

#### DELETE /api/dashboards/:id/filters/:filterId

Remove a filter from the dashboard.

**Required Permission**: `dashboard:write`

---

#### POST /api/dashboards/:id/duplicate

Duplicate a dashboard.

**Required Permission**: `dashboard:write`

---

### User Endpoints

#### POST /api/users

Create a new user (admin only).

**Required Permission**: `user:admin`

**Request Body**:

```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "roleId": "role_viewer"
}
```

---

#### GET /api/users

List users in the organization.

**Required Permission**: `user:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (`active`, `inactive`, `invited`) |
| `search` | string | Search by name or email |
| `limit` | number | Results per page |
| `offset` | number | Pagination offset |

---

#### GET /api/users/:id

Get a specific user's profile.

**Required Permission**: `user:read`

---

#### PUT /api/users/:id

Update a user's profile.

**Required Permission**: `user:write` (own profile) or `user:admin` (any user)

---

#### DELETE /api/users/:id

Delete a user account.

**Required Permission**: `user:admin`

---

#### POST /api/users/:id/activate

Activate a deactivated user.

**Required Permission**: `user:admin`

---

#### POST /api/users/:id/deactivate

Deactivate a user (soft delete).

**Required Permission**: `user:admin`

---

#### PUT /api/users/:id/role

Change a user's role.

**Required Permission**: `user:admin`

**Request Body**:

```json
{
  "roleId": "role_editor"
}
```

---

### Plugin Endpoints

#### GET /api/plugins

List all registered plugins.

**Required Permission**: `plugin:read`

**Response** (200):

```json
{
  "ok": true,
  "data": [
    {
      "name": "custom-connector",
      "version": "1.0.0",
      "type": "connector",
      "description": "Custom data source connector",
      "author": "Acme Corp",
      "enabled": true,
      "loadedAt": "2026-03-17T12:00:00.000Z"
    }
  ]
}
```

---

#### POST /api/plugins/install

Install a new plugin.

**Required Permission**: `plugin:admin`

**Request Body**:

```json
{
  "name": "custom-connector",
  "source": "npm",
  "package": "@acme/meridian-connector"
}
```

---

#### POST /api/plugins/:name/enable

Enable a disabled plugin.

**Required Permission**: `plugin:admin`

---

#### POST /api/plugins/:name/disable

Disable an active plugin.

**Required Permission**: `plugin:admin`

---

### Embed Endpoints

#### POST /api/embed/token

Generate a time-limited embed token for external applications.

**Required Permission**: `embed:admin`

**Request Body**:

```json
{
  "resourceType": "dashboard",
  "resourceId": "dash_abc123",
  "expiresIn": "24h",
  "permissions": ["read"]
}
```

**Response** (200):

```json
{
  "ok": true,
  "data": {
    "token": "emb_eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2026-03-18T12:00:00.000Z"
  }
}
```

---

#### GET /api/embed/dashboard/:id

Get an embedded dashboard (authenticated via embed token).

**Authentication**: Embed token via query parameter `?token=emb_...`

---

#### GET /api/embed/question/:id

Get an embedded question (authenticated via embed token).

**Authentication**: Embed token via query parameter `?token=emb_...`

---

### Export Endpoints

#### POST /api/export/question/:id

Export a question's results in the specified format.

**Required Permission**: `question:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Export format: `csv`, `json`, `xlsx`, `pdf`, `png` |

**Response**: File download with appropriate Content-Type header.

| Format | Content-Type | Status |
|--------|-------------|--------|
| `csv` | `text/csv` | Implemented |
| `json` | `application/json` | Implemented |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Stub |
| `pdf` | `application/pdf` | Stub |
| `png` | `image/png` | Stub |

---

#### POST /api/export/dashboard/:id

Export an entire dashboard in the specified format.

**Required Permission**: `dashboard:read`

---

### Admin Endpoints

#### GET /api/admin/settings

Get system settings.

**Required Permission**: `admin:read`

---

#### PUT /api/admin/settings

Update system settings.

**Required Permission**: `admin:write`

---

#### GET /api/admin/audit

Query audit logs.

**Required Permission**: `admin:read`

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Filter by user |
| `action` | string | Filter by action type |
| `resourceType` | string | Filter by resource type |
| `startDate` | string | Start of date range (ISO 8601) |
| `endDate` | string | End of date range (ISO 8601) |
| `limit` | number | Results per page |
| `offset` | number | Pagination offset |

---

#### GET /api/admin/system

Get system information (version, uptime, resource usage).

**Required Permission**: `admin:read`

---

### Semantic Layer Endpoints

#### GET /api/semantic/metrics

List all metric definitions.

---

#### POST /api/semantic/metrics

Create a new metric definition.

**Request Body**:

```json
{
  "name": "monthly_revenue",
  "displayName": "Monthly Revenue",
  "description": "Total revenue aggregated by month",
  "dataSourceId": "ds_abc123",
  "table": "orders",
  "measure": { "field": "total", "aggregation": "sum" },
  "timeDimension": { "field": "created_at", "granularity": "month" },
  "filters": []
}
```

---

#### GET /api/semantic/models

List all semantic models.

---

#### POST /api/semantic/models

Create a new semantic model.

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or parameters failed Zod validation |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions for the requested action |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Resource already exists (duplicate name, email, etc.) |
| `RATE_LIMITED` | 429 | Too many requests; retry after the indicated period |
| `INTERNAL_ERROR` | 500 | Unexpected server error (details hidden in production) |
| `CONNECTION_ERROR` | 502 | Data source connection failed |
| `QUERY_ERROR` | 422 | SQL query execution failed (syntax error, timeout, etc.) |
| `EXPORT_ERROR` | 422 | Export generation failed |
| `PLUGIN_ERROR` | 422 | Plugin loading or execution failed |

---

## Pagination

List endpoints support offset-based pagination:

| Parameter | Type | Default | Max |
|-----------|------|---------|-----|
| `limit` | number | 25 | 100 |
| `offset` | number | 0 | -- |

The response `meta.pagination` field contains:
- `total`: Total number of matching records
- `limit`: Current page size
- `offset`: Current offset

---

## Rate Limiting

API endpoints are rate-limited per IP address (or per user when authenticated).

| Default Configuration | Value |
|----------------------|-------|
| Max requests per window | Configured via `RATE_LIMIT_MAX` (default: 1000) |
| Window duration | Configured via `RATE_LIMIT_WINDOW_MS` (default: 60000ms) |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 997
X-RateLimit-Reset: 1710676800
```

When rate limited, the API returns:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later",
    "details": {
      "retryAfter": 30
    }
  }
}
```
