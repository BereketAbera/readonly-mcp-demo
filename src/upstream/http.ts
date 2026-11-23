/**
 * The only code path from this server to an upstream API.
 *
 * - `ReadOnlyClient` exposes a single public method, `get()`, and refuses any
 *   path that is not on its fixed allowlist.
 * - `readOnlyFetch` wraps the underlying `fetch`: it lets through GET requests
 *   to the two configured API origins and POST requests to the two OAuth token
 *   URLs, and throws on everything else.
 */

export type FetchLike = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

export type ApiName = "workforce" | "booking";

const API_LABEL: Record<ApiName, string> = { workforce: "Workforce API", booking: "Booking API" };

export class UpstreamPolicyError extends Error {
  override name = "UpstreamPolicyError";
}

export class UpstreamHttpError extends Error {
  override name = "UpstreamHttpError";
  constructor(
    readonly api: ApiName,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class UpstreamAuthError extends Error {
  override name = "UpstreamAuthError";
}

export interface TokenSource {
  getToken(): Promise<string>;
  invalidate(): void;
}

export interface PathRule {
  readonly name: string;
  readonly template: string;
  readonly pattern: RegExp;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compiles path templates such as `/scheduler/v2/schedulers/{schedulerId}/shifts`. */
export function pathRules(entries: ReadonlyArray<readonly [name: string, template: string]>): PathRule[] {
  return entries.map(([name, template]) => {
    const source = template
      .split(/(\{[^}]+\})/)
      .map((part) => (part.startsWith("{") ? "\\d{1,12}" : escapeRegex(part)))
      .join("");
    return Object.freeze({ name, template, pattern: new RegExp(`^${source}$`) });
  });
}

const SAFE_PATH = /^\/[A-Za-z0-9/-]*$/;

export function matchRule(path: string, rules: readonly PathRule[]): PathRule | undefined {
  if (!SAFE_PATH.test(path) || path.includes("//")) return undefined;
  return rules.find((rule) => rule.pattern.test(path));
}

export type QueryValue = string | number | boolean | ReadonlyArray<string | number> | undefined;

export interface ReadOnlyClientOptions {
  api: ApiName;
  baseUrl: string;
  rules: readonly PathRule[];
  tokens: TokenSource;
  fetch: FetchLike;
  timeoutMs?: number;
  /** Minimum spacing between calls (the booking API allows one call per second). */
  minIntervalMs?: number;
}

// #region readonly-client
export class ReadOnlyClient {
  private readonly origin: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;

  constructor(private readonly options: ReadOnlyClientOptions) {
    this.origin = new URL(options.baseUrl).origin;
  }

  /** The only public way to reach an upstream API: GET, allowlisted paths only. */
  async get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    const rule = matchRule(path, this.options.rules);
    if (!rule) {
      throw new UpstreamPolicyError(`${API_LABEL[this.options.api]}: path is not on the read-only allowlist`);
    }
    const url = new URL(this.options.baseUrl.replace(/\/$/, "") + path);
    if (url.origin !== this.origin) throw new UpstreamPolicyError("Upstream origin mismatch");
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    return this.send<T>("GET", url, rule, true);
  }

  private async send<T>(method: "GET", url: URL, rule: PathRule, retryOn401: boolean): Promise<T> {
    // Types can be bypassed at runtime; this check cannot.
    if (method !== "GET") throw new UpstreamPolicyError(`Blocked ${String(method)}: upstream access is read-only`);
    await this.throttle();
    const token = await this.options.tokens.getToken();
    const response = await this.options.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (response.status === 401 && retryOn401) {
      // Reuse a token until the API rejects it, then fetch one new token and retry once.
      this.options.tokens.invalidate();
      return this.send<T>(method, url, rule, false);
    }
    if (!response.ok) {
      throw new UpstreamHttpError(
        this.options.api,
        response.status,
        `${API_LABEL[this.options.api]} returned HTTP ${response.status} for "${rule.name}"`,
      );
    }
    return (await response.json()) as T;
  }
  // #endregion readonly-client

  private async throttle(): Promise<void> {
    const interval = this.options.minIntervalMs ?? 0;
    if (interval <= 0) return;
    const turn = this.queue.then(async () => {
      const wait = this.lastCallAt + interval - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
    });
    this.queue = turn.catch(() => undefined);
    await turn;
  }
}

// #region fetch-guard
export interface FetchPolicy {
  /** Origins that may receive GET requests. */
  apiOrigins: readonly string[];
  /** Exact URLs (origin + path) that may receive the OAuth token POST. */
  tokenUrls: readonly string[];
}

export function readOnlyFetch(inner: FetchLike, policy: FetchPolicy): FetchLike {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const target = `${url.origin}${url.pathname}`;
    if (request.method === "POST" && policy.tokenUrls.includes(target) && url.search === "") {
      return inner(request);
    }
    if (request.method !== "GET") {
      throw new UpstreamPolicyError(`Blocked ${request.method} ${target}: upstream access is read-only`);
    }
    if (!policy.apiOrigins.includes(url.origin)) {
      throw new UpstreamPolicyError(`Blocked request to unexpected host ${url.host}`);
    }
    return inner(request);
  };
}
// #endregion fetch-guard
