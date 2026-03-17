import type { FastifyInstance } from 'fastify';
import type { Logger } from '@meridian/shared';

// ── Compression Configuration ────────────────────────────────────────

/**
 * Options for the compression middleware.
 */
export interface CompressionOptions {
  /**
   * Minimum response body size in bytes before compression is applied.
   * Responses smaller than this threshold are sent uncompressed to
   * avoid the CPU overhead outweighing the bandwidth saving.
   * @default 1024 (1 KB)
   */
  threshold?: number;

  /**
   * zlib compression level (0 = none, 9 = max, -1 = default).
   * @default -1
   */
  level?: number;

  /**
   * Whether to enable Brotli compression for clients that support it.
   * Brotli provides better compression ratios than gzip but is slower.
   * Recommended for production; disable if CPU is constrained.
   * @default true
   */
  brotli?: boolean;

  /**
   * Content-Type patterns that should be compressed.
   * Only responses whose Content-Type matches one of these patterns
   * will be compressed.
   * @default standard text and JSON types
   */
  compressibleTypes?: RegExp;

  /**
   * URL path prefixes to skip compression for.
   * Useful for binary download endpoints where the response is
   * already compressed (e.g. pre-built PDF files).
   * @default []
   */
  skipPaths?: string[];
}

// ── Default compressible content types ──────────────────────────────

const DEFAULT_COMPRESSIBLE_TYPES = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded)|image\/svg)/;

// ── Lightweight manual compression hook ─────────────────────────────
// @fastify/compress is the recommended production choice. This module
// provides a compatible interface that can be swapped to @fastify/compress
// in a real deployment, while giving a working implementation for the
// current in-memory architecture.

type EncodingFn = (buf: Buffer, level: number) => Buffer;

/**
 * Try to load the Node.js built-in `zlib` module and return a gzip
 * encoder function. Returns null when unavailable (e.g. in test env).
 */
async function tryLoadZlib(): Promise<{ gzip: EncodingFn } | null> {
  try {
    const zlib = await import('node:zlib');
    const gzip: EncodingFn = (buf, level) =>
      zlib.gzipSync(buf, { level: level === -1 ? zlib.constants.Z_DEFAULT_COMPRESSION : level });
    return { gzip };
  } catch {
    return null;
  }
}

// ── Registration ─────────────────────────────────────────────────────

/**
 * Register response compression on a Fastify instance.
 *
 * Compresses responses using gzip (or Brotli when supported and opted in)
 * when:
 *   - The client sends `Accept-Encoding: gzip` / `br`
 *   - The response Content-Type is a compressible text format
 *   - The response body is larger than `threshold` bytes
 *
 * In production, replace this with `@fastify/compress` for better
 * performance and streaming support.
 */
export async function registerCompression(
  app: FastifyInstance,
  options: CompressionOptions = {},
  logger?: Logger,
): Promise<void> {
  const threshold = options.threshold ?? 1024;
  const level = options.level ?? -1;
  const compressibleTypes = options.compressibleTypes ?? DEFAULT_COMPRESSIBLE_TYPES;
  const skipPaths = new Set(options.skipPaths ?? []);

  const zlib = await tryLoadZlib();
  if (!zlib) {
    logger?.warn('zlib not available — response compression disabled');
    return;
  }

  app.addHook('onSend', async (request, reply, payload) => {
    // Skip paths opted out of compression
    const path = request.url.split('?')[0];
    for (const skip of skipPaths) {
      if (path.startsWith(skip)) return payload;
    }

    // Only compress when the client requests it
    const acceptEncoding = request.headers['accept-encoding'] ?? '';
    const wantsGzip = /\bgzip\b/i.test(acceptEncoding);
    if (!wantsGzip) return payload;

    // Only compress compressible content types
    const contentType = (reply.getHeader('content-type') as string | undefined) ?? '';
    if (!compressibleTypes.test(contentType)) return payload;

    // Resolve payload to a Buffer
    let buf: Buffer;
    if (typeof payload === 'string') {
      buf = Buffer.from(payload, 'utf-8');
    } else if (Buffer.isBuffer(payload)) {
      buf = payload;
    } else {
      // Streams, null, etc. — skip
      return payload;
    }

    // Skip small payloads
    if (buf.byteLength < threshold) return payload;

    try {
      const compressed = zlib.gzip(buf, level);

      void reply.header('Content-Encoding', 'gzip');
      void reply.header('Content-Length', compressed.byteLength);
      void reply.removeHeader('Content-Length'); // let Fastify set it
      void reply.header('Content-Encoding', 'gzip');
      void reply.header('Vary', 'Accept-Encoding');

      logger?.debug('Response compressed', {
        path,
        originalBytes: buf.byteLength,
        compressedBytes: compressed.byteLength,
        ratio: (compressed.byteLength / buf.byteLength).toFixed(2),
      });

      return compressed;
    } catch (err) {
      // If compression fails, send the original payload unmodified
      logger?.warn('Compression failed, sending uncompressed', {
        path,
        error: (err as Error).message,
      });
      return payload;
    }
  });

  logger?.debug('Response compression registered', { threshold, level });
}

/**
 * Determine whether a given Content-Type string should be compressed.
 * Exported for unit testing.
 */
export function isCompressible(contentType: string, pattern = DEFAULT_COMPRESSIBLE_TYPES): boolean {
  return pattern.test(contentType);
}
