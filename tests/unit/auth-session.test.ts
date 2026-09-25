import { describe, expect, test } from "bun:test";
import {
  SESSION_TTL_MS,
  isSessionExpired,
  newSessionDates,
  newSessionToken,
  rotateSession,
  shouldRotateSession,
} from "@admin-alquiler/auth";

describe("sessions", () => {
  test("new sessions expire SESSION_TTL_MS in the future", () => {
    const now = Date.now();
    const dates = newSessionDates(now);
    expect(dates.expiresAt).toBe(now + SESSION_TTL_MS);
    expect(isSessionExpired(dates, now)).toBe(false);
  });

  test("expired sessions are detected", () => {
    const dates = newSessionDates(1000);
    expect(isSessionExpired(dates, 1000 + SESSION_TTL_MS)).toBe(true);
    expect(isSessionExpired(dates, 1000 + SESSION_TTL_MS + 1)).toBe(true);
  });

  test("rotation is suggested after a day and refreshes expiry", () => {
    const start = 1_000_000;
    const dates = newSessionDates(start);
    expect(shouldRotateSession(dates, start)).toBe(false);
    const later = start + 25 * 60 * 60 * 1000;
    expect(shouldRotateSession(dates, later)).toBe(true);
    const rotated = rotateSession(dates, later);
    expect(rotated.rotatedAt).toBe(later);
    expect(rotated.expiresAt).toBe(later + SESSION_TTL_MS);
    expect(shouldRotateSession(rotated, later)).toBe(false);
  });

  test("expired sessions are never rotated", () => {
    const dates = newSessionDates(1000);
    expect(shouldRotateSession(dates, 1000 + SESSION_TTL_MS + 1)).toBe(false);
  });

  test("session tokens are unique opaque values", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBe(64);
  });
});
