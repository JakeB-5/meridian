import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── Request-ID Middleware ────────────────────────────────────────────

/**
 * Configuration for the request-ID middleware.
 */
export interface RequestIdMiddlewareOptions {
  /**
   * Name of the inbound header to read an existing ID from.
   * If the client sends this header, its value is used as the request ID.
   * @default 'x-request-id'
   */
  incomingHeader?: string;

  /**
   * Name of the outbound header to echo the request ID on responses.
   * @default 'x-request-id'
   */
  outgoingHeader?: string;

  /**
   * Generator function for new request IDs when no inbound ID is present.
   * Defaults to `crypto.randomUUID()`.
   */
  generate?: () => string;

  /**
   * Optional validator for inbound IDs.
   * If the inbound ID fails validation a new one is generated.
   * @default accepts any non-empty string up to 128 chars
   */
  validate?: (id: string) => boolean;
}

/**
 * Default validator: accepts UUIDs and other short alphanumeric IDs.
 * Rejects anything that looks like it could be used for log injection.
 */
function defaultValidate(id: string): boolean {
  return id.length > 0 && id.length <= 128 && /^[\w\-:.]+$/.test(id);
}

// ── Registration ─────────────────────────────────────────────────────

/**
 * Attach a unique request ID to every request and echo it on the response.
 *
 * Priority order for the request ID value:
 * 1. Valid value from the inbound `X-Request-Id` header (if trusted)
 * 2. Fastify's own `request.id` (set by `genReqId` in Fastify options)
 * 3. Freshly generated UUID
 *
 * The resolved ID is attached to `request.id` so it flows through to
 * the error handler and logging middleware automatically.
 */
export function registerRequestId(
  app: FastifyInstance,
  options: RequestIdMiddlewareOptions = {},
): void {
  const incomingHeader = options.incomingHeader ?? 'x-request-id';
  const outgoingHeader = options.outgoingHeader ?? 'x-request-id';
  const generate = options.generate ?? (() => crypto.randomUUID());
  const validate = options.validate ?? defaultValidate;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Check inbound header
    const inbound = request.headers[incomingHeader];
    const inboundId = Array.isArray(inbound) ? inbound[0] : inbound;

    let resolvedId: string;

    if (inboundId && validate(inboundId)) {
      // Use the caller-supplied ID (useful for distributed tracing)
      resolvedId = inboundId;
    } else if (request.id && validate(String(request.id))) {
      // Fastify already assigned an ID via genReqId
      resolvedId = String(request.id);
    } else {
      // Generate a fresh UUID
      resolvedId = generate();
    }

    // Overwrite request.id so it is consistent throughout the lifecycle
    (request as FastifyRequest & { id: string }).id = resolvedId;

    // Echo the resolved ID on the response immediately
    void reply.header(outgoingHeader, resolvedId);
  });
}

/**
 * Extract the request ID from a request object.
 * Returns an empty string when no ID is set.
 */
export function getRequestId(request: FastifyRequest): string {
  return String(request.id ?? '');
}
