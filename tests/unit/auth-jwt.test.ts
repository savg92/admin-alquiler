import { describe, expect, test } from "bun:test";
import { signAccessToken, verifyAccessToken } from "@admin-alquiler/auth";

const SECRET = "test-secret-with-at-least-32-characters!!";
const USER = { id: "user-1", email: "admin@ejemplo.co" };

describe("access tokens", () => {
  test("login issues a verifiable token", () => {
    const token = signAccessToken(SECRET, USER, "session-1");
    const result = verifyAccessToken(SECRET, token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("user-1");
      expect(result.claims.email).toBe("admin@ejemplo.co");
      expect(result.claims.sessionId).toBe("session-1");
    }
  });

  test("expired tokens are rejected", () => {
    const token = signAccessToken(SECRET, USER, "session-1", Date.now(), -10);
    const result = verifyAccessToken(SECRET, token);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  test("tampered payloads fail signature verification", () => {
    const token = signAccessToken(SECRET, USER, "session-1");
    const segments = token.split(".");
    const tampered = `${segments[0]}.${segments[1]}x.${segments[2]}`;
    expect(verifyAccessToken(SECRET, tampered)).toEqual({ ok: false, reason: "signature" });
  });

  test("wrong secret fails verification", () => {
    const token = signAccessToken(SECRET, USER, "session-1");
    expect(verifyAccessToken("different-secret-00000000000000000000", token)).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  test("malformed tokens fail closed", () => {
    expect(verifyAccessToken(SECRET, "not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyAccessToken(SECRET, "a.b")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyAccessToken(SECRET, "")).toEqual({ ok: false, reason: "malformed" });
  });
});
