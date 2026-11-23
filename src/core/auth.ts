/**
 * Bearer-token check for the MCP endpoint.
 *
 * Both the presented token and every accepted token are hashed with SHA-256
 * first, so the comparison always runs over 32 bytes regardless of input
 * length, and every accepted token is compared (no early exit).
 */

export interface AcceptedToken {
  /** Short, non-reversible label used in logs and as the rate-limit key. */
  id: string;
  kind: "secret" | "public-demo";
  digest: Uint8Array;
}

export type AuthResult =
  | { ok: true; tokenId: string; kind: AcceptedToken["kind"] }
  | { ok: false; reason: "missing" | "malformed" | "invalid" };

const encoder = new TextEncoder();

export async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// #region constant-time
/** Constant-time comparison of two equal-length digests. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyBearer(
  authorization: string | null,
  accepted: readonly AcceptedToken[],
): Promise<AuthResult> {
  if (!authorization) return { ok: false, reason: "missing" };
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{8,512})\s*$/i.exec(authorization);
  if (!match) return { ok: false, reason: "malformed" };

  const presented = await sha256(match[1]);
  let found: AcceptedToken | undefined;
  for (const token of accepted) {
    // Compare against every token so timing does not reveal which one matched.
    if (timingSafeEqual(presented, token.digest) && !found) found = token;
  }
  return found ? { ok: true, tokenId: found.id, kind: found.kind } : { ok: false, reason: "invalid" };
}
// #endregion constant-time

export async function acceptedToken(value: string, kind: AcceptedToken["kind"]): Promise<AcceptedToken> {
  const digest = await sha256(value);
  return { id: `tok_${toHex(digest).slice(0, 10)}`, kind, digest };
}
