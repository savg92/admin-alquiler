import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  sessionId: string;
  iat: number;
  exp: number;
  jti: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function base64urlEncode(input: string | Buffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function signAccessToken(
  secret: string,
  user: { id: string; email: string },
  sessionId: string,
  now: number = Date.now(),
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims: AccessTokenClaims = {
    sub: user.id,
    email: user.email,
    sessionId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
    jti: randomUUID(),
  };
  const payload = base64urlEncode(JSON.stringify(claims));
  const signature = base64urlEncode(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

export type TokenVerification =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

export function verifyAccessToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): TokenVerification {
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    return { ok: false, reason: "malformed" };
  }
  const [header, payload, signature] = segments;
  const expected = base64urlEncode(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return { ok: false, reason: "signature" };
  }
  let claims: AccessTokenClaims;
  try {
    claims = JSON.parse(base64urlDecode(payload).toString("utf8")) as AccessTokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.sessionId !== "string" ||
    typeof claims.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (claims.exp * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims };
}
