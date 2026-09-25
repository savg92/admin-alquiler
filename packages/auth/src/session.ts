import { randomBytes } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ROTATION_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionDates {
  createdAt: number;
  rotatedAt: number | null;
  expiresAt: number;
}

export function newSessionDates(now: number = Date.now()): SessionDates {
  return { createdAt: now, rotatedAt: null, expiresAt: now + SESSION_TTL_MS };
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function isSessionExpired(
  dates: Pick<SessionDates, "expiresAt">,
  now: number = Date.now(),
): boolean {
  return dates.expiresAt <= now;
}

export function shouldRotateSession(dates: SessionDates, now: number = Date.now()): boolean {
  if (isSessionExpired(dates, now)) {
    return false;
  }
  const lastRotation = dates.rotatedAt ?? dates.createdAt;
  return lastRotation + SESSION_ROTATION_AFTER_MS <= now;
}

export function rotateSession(dates: SessionDates, now: number = Date.now()): SessionDates {
  return { createdAt: dates.createdAt, rotatedAt: now, expiresAt: now + SESSION_TTL_MS };
}
