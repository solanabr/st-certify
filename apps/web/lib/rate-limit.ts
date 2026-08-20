// In-memory and per-process: a warm serverless instance shares one Map, so a
// burst spread across cold starts can slip through and counts reset on deploy.
// Acceptable for the devnet deployment — a KV store is the wake-up-later item
// if this scales out. Mirrors the inline limiter in app/api/airdrop/route.ts.

interface RateLimiterOptions {
  windowMs: number;
  /** Hits allowed per key per window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window frees up; 0 when allowed. */
  retryAfterSeconds: number;
}

/** Keys tracked before expired ones get swept — bounds growth on public routes. */
const SWEEP_THRESHOLD = 1_000;

/**
 * Fixed-window limiter keyed by an arbitrary string (wallet, DID, IP).
 * `now` is injectable so tests can advance the clock without timers.
 */
export function createRateLimiter({
  windowMs,
  max,
}: RateLimiterOptions): (key: string, now?: number) => RateLimitResult {
  const hits = new Map<string, number[]>();

  return function take(key, now = Date.now()): RateLimitResult {
    if (hits.size > SWEEP_THRESHOLD) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }

    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.set(key, recent);

    if (recent.length >= max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000),
      };
    }

    recent.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  };
}
