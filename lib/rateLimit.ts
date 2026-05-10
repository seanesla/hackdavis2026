// Simple in-memory IP-based rate limiter.
//
// On Vercel each warm function instance has its own copy of `buckets`, so this
// is per-instance, not globally accurate. That's fine for our threat model —
// it stops a single client from looping requests against an instance and
// running up the Gemini bill. For stricter cross-instance limits, swap in
// Upstash Redis or Vercel Marketplace KV later.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically prune expired buckets so the map doesn't grow unboundedly on
// long-running warm instances. 1024 entries is a soft cap.
function gc(now: number) {
  if (buckets.size < 1024) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitOptions = {
  // Bucket name — usually the route ("plan", "floorplan", etc.).
  bucket: string;
  // Max requests allowed in the window.
  limit: number;
  // Window length in milliseconds.
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSeconds: number; resetAt: number };

// Pull the client IP from the standard proxy headers Vercel forwards. Falls
// back to a constant string so local requests still hit the limiter.
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimit(req: Request, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  gc(now);

  const ip = clientIp(req);
  const key = `${opts.bucket}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (existing.count >= opts.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, retryAfterSeconds, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

// Build a 429 Response with proper headers when the limiter rejects.
export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>): Response {
  return Response.json(
    {
      ok: false,
      error: "Too many requests. Please slow down.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
