import type { ServerConfig } from "../core/config";
import { createMockUpstream, type MockUpstream } from "../mock/upstream-mock";
import { BookingApi, BOOKING_RULES } from "./booking";
import { ReadOnlyClient, readOnlyFetch, type FetchLike } from "./http";
import { ClientCredentialsTokenSource } from "./oauth";
import { WorkforceApi, WORKFORCE_RULES } from "./workforce";

export interface Upstreams {
  workforce: WorkforceApi;
  booking: BookingApi;
  clients: { workforce: ReadOnlyClient; booking: ReadOnlyClient };
  tokens: { workforce: ClientCredentialsTokenSource; booking: ClientCredentialsTokenSource };
  /** The guarded fetch every upstream request goes through. */
  fetch: FetchLike;
  mock?: MockUpstream;
}

export interface UpstreamDeps {
  /** Network fetch used in live mode (defaults to the global fetch). */
  fetch?: FetchLike;
  now?: () => number;
}

export function createUpstreams(config: ServerConfig, deps: UpstreamDeps = {}): Upstreams {
  const mock =
    config.mode === "mock"
      ? createMockUpstream({
          workforceBaseUrl: config.workforce.baseUrl,
          bookingBaseUrl: config.booking.baseUrl,
          credentials: {
            workforce: { clientId: config.workforce.clientId, clientSecret: config.workforce.clientSecret },
            booking: { clientId: config.booking.clientId, clientSecret: config.booking.clientSecret },
          },
          now: deps.now,
        })
      : undefined;

  const transport: FetchLike = mock?.fetch ?? deps.fetch ?? ((input, init) => fetch(input, init));
  const guarded = readOnlyFetch(transport, {
    apiOrigins: [new URL(config.workforce.baseUrl).origin, new URL(config.booking.baseUrl).origin],
    tokenUrls: [config.workforce.tokenUrl, config.booking.tokenUrl].map((u) => {
      const url = new URL(u);
      return `${url.origin}${url.pathname}`;
    }),
  });

  const tokens = {
    workforce: new ClientCredentialsTokenSource({
      api: "workforce",
      tokenUrl: config.workforce.tokenUrl,
      style: "basic-form",
      credentials: { clientId: config.workforce.clientId, clientSecret: config.workforce.clientSecret },
      fetch: guarded,
      now: deps.now,
    }),
    booking: new ClientCredentialsTokenSource({
      api: "booking",
      tokenUrl: config.booking.tokenUrl,
      style: "json-body",
      credentials: { clientId: config.booking.clientId, clientSecret: config.booking.clientSecret },
      fetch: guarded,
      now: deps.now,
    }),
  };

  const clients = {
    workforce: new ReadOnlyClient({
      api: "workforce",
      baseUrl: config.workforce.baseUrl,
      rules: WORKFORCE_RULES,
      tokens: tokens.workforce,
      fetch: guarded,
    }),
    booking: new ReadOnlyClient({
      api: "booking",
      baseUrl: config.booking.baseUrl,
      rules: BOOKING_RULES,
      tokens: tokens.booking,
      fetch: guarded,
      // The live booking API allows one call per second per credential set.
      minIntervalMs: config.mode === "live" ? 1_050 : 0,
    }),
  };

  return {
    workforce: new WorkforceApi(clients.workforce),
    booking: new BookingApi(clients.booking),
    clients,
    tokens,
    fetch: guarded,
    mock,
  };
}
