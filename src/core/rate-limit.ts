/**
 * Per-token rate limiting.
 *
 * `MemoryRateLimiter` is a sliding-window-log limiter kept in memory. It is
 * exact within one process (Vercel function instance, Worker isolate, test).
 * On Cloudflare the Worker prefers the Workers Rate Limiting binding when it
 * is configured, which is shared across isolates in a location.
 */

export interface RateDecision {
  allowed: boolean;
  /** Seconds until another request is allowed (0 when allowed). */
  retryAfter: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateDecision>;
}

// #region rate-limit
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async check(key: string): Promise<RateDecision> {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfter = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
      return { allowed: false, retryAfter };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5_000) this.prune(now);
    return { allowed: true, retryAfter: 0 };
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
// #endregion rate-limit

/** Shape of the Cloudflare Workers Rate Limiting binding. */
export interface WorkersRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class WorkersRateLimiter implements RateLimiter {
  constructor(
    private readonly binding: WorkersRateLimitBinding,
    private readonly periodSeconds: number,
  ) {}

  async check(key: string): Promise<RateDecision> {
    const { success } = await this.binding.limit({ key });
    return { allowed: success, retryAfter: success ? 0 : this.periodSeconds };
  }
}
