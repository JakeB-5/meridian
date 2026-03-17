# Group F1: apps/server — Fastify API Server

## Task
Implement the main API server using Fastify 5 with all route modules.

## Files to Create

### src/app.ts
Fastify application factory:
- Plugin registration (cors, jwt, swagger, websocket)
- Route registration
- Error handler
- Graceful shutdown
- Health check endpoint: GET /health

### src/config.ts
Server configuration from env:
- DATABASE_URL, REDIS_URL
- JWT_SECRET, PORT
- LOG_LEVEL, CORS_ORIGIN

### src/plugins/auth.plugin.ts
Fastify plugin for authentication:
- Decorates request with `user`
- Provides `requireAuth` and `requirePermission` hooks

### src/plugins/websocket.plugin.ts
WebSocket upgrade handling via @meridian/realtime

### src/routes/auth.routes.ts
```
POST /api/auth/register — Register new user
POST /api/auth/login — Login, return token pair
POST /api/auth/refresh — Refresh access token
POST /api/auth/logout — Revoke refresh token
GET  /api/auth/me — Get current user
```

### src/routes/datasources.routes.ts
```
GET    /api/datasources — List datasources for org
POST   /api/datasources — Create datasource
GET    /api/datasources/:id — Get datasource
PUT    /api/datasources/:id — Update datasource
DELETE /api/datasources/:id — Delete datasource
POST   /api/datasources/:id/test — Test connection
GET    /api/datasources/:id/schema — Get database schema
GET    /api/datasources/:id/tables — List tables
GET    /api/datasources/:id/tables/:table/columns — List columns
```

### src/routes/questions.routes.ts
```
GET    /api/questions — List questions for org
POST   /api/questions — Create question
GET    /api/questions/:id — Get question
PUT    /api/questions/:id — Update question
DELETE /api/questions/:id — Delete question
POST   /api/questions/:id/execute — Execute question query
POST   /api/questions/preview — Execute ad-hoc query (no save)
```

### src/routes/dashboards.routes.ts
```
GET    /api/dashboards — List dashboards
POST   /api/dashboards — Create dashboard
GET    /api/dashboards/:id — Get dashboard with cards
PUT    /api/dashboards/:id — Update dashboard
DELETE /api/dashboards/:id — Delete dashboard
POST   /api/dashboards/:id/cards — Add card
PUT    /api/dashboards/:id/cards/:cardId — Update card
DELETE /api/dashboards/:id/cards/:cardId — Remove card
POST   /api/dashboards/:id/share — Generate public share link
```

### src/routes/users.routes.ts
```
GET    /api/users — List users in org
POST   /api/users — Create/invite user
GET    /api/users/:id — Get user
PUT    /api/users/:id — Update user
DELETE /api/users/:id — Deactivate user
PUT    /api/users/:id/role — Assign role
```

### src/routes/plugins.routes.ts
```
GET    /api/plugins — List installed plugins
POST   /api/plugins — Install plugin
PUT    /api/plugins/:name/enable — Enable plugin
PUT    /api/plugins/:name/disable — Disable plugin
DELETE /api/plugins/:name — Uninstall plugin
```

### src/routes/embed.routes.ts
```
POST   /api/embed/token — Generate embed token
GET    /api/embed/dashboard/:id — Get dashboard for embed
GET    /api/embed/question/:id — Get question for embed
POST   /api/embed/question/:id/execute — Execute for embed
```

### src/middleware/error-handler.ts
Global error handler:
- MeridianError → proper HTTP status + error code
- Zod validation errors → 400 with field details
- Unknown errors → 500 with generic message + log

### src/middleware/request-logger.ts
Request/response logging with pino

### src/middleware/rate-limiter.ts
Rate limiting per route or global

### src/services/container.ts
Dependency injection container:
- Creates all services, repositories, connectors
- Wires dependencies
- Singleton management

### src/server.ts
Server entry point: createApp() → listen()

### src/index.ts — re-exports createApp

## Tests (using Fastify inject)
- src/routes/auth.routes.test.ts
- src/routes/datasources.routes.test.ts
- src/routes/questions.routes.test.ts
- src/routes/dashboards.routes.test.ts
- src/routes/users.routes.test.ts
- src/middleware/error-handler.test.ts
- src/services/container.test.ts

## Dependencies
- All @meridian/* packages
- fastify, @fastify/cors, @fastify/swagger, @fastify/websocket, @fastify/rate-limit

## Estimated LOC: ~12000 + ~4000 tests
