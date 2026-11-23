import { UpstreamAuthError, type ApiName, type FetchLike, type TokenSource } from "./http";

/**
 * OAuth 2.0 client-credentials tokens, cached until shortly before expiry.
 *
 * The two upstream APIs send credentials differently:
 *  - workforce (Connecteam-shaped): HTTP Basic auth + form-encoded
 *    `grant_type=client_credentials`.
 *  - booking (ROLLER-shaped): JSON body `{ client_id, client_secret }`.
 */

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TokenSourceOptions {
  api: ApiName;
  tokenUrl: string;
  style: "basic-form" | "json-body";
  credentials: ClientCredentials;
  fetch: FetchLike;
  now?: () => number;
  /** Refresh this many seconds before the upstream expiry. */
  skewSeconds?: number;
}

// #region token-cache
export class ClientCredentialsTokenSource implements TokenSource {
  private cached?: { token: string; expiresAt: number };
  private inflight?: Promise<string>;
  /** Number of token requests made, exposed for tests and diagnostics. */
  requestCount = 0;

  constructor(private readonly options: TokenSourceOptions) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt) return this.cached.token;
    // Concurrent callers share one in-flight token request.
    this.inflight ??= this.requestToken().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.cached = undefined;
  }
  // #endregion token-cache

  private async requestToken(): Promise<string> {
    this.requestCount += 1;
    const { clientId, clientSecret } = this.options.credentials;
    const init: RequestInit =
      this.options.style === "basic-form"
        ? {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
          };

    const response = await this.options.fetch(this.options.tokenUrl, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new UpstreamAuthError(`${this.options.api} token request failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || body.access_token.length === 0) {
      throw new UpstreamAuthError(`${this.options.api} token response had no access_token`);
    }
    const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
    const skew = this.options.skewSeconds ?? 60;
    this.cached = {
      token: body.access_token,
      expiresAt: this.now() + Math.max(0, expiresIn - skew) * 1000,
    };
    return body.access_token;
  }
}
