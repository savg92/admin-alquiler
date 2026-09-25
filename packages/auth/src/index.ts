export const AUTH_VERSION = "0.1.0";
export { hashPassword, verifyPassword } from "./password";
export { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, verifyAccessToken } from "./jwt";
export type { AccessTokenClaims, TokenVerification } from "./jwt";
export {
  SESSION_ROTATION_AFTER_MS,
  SESSION_TTL_MS,
  isSessionExpired,
  newSessionDates,
  newSessionToken,
  rotateSession,
  shouldRotateSession,
} from "./session";
export type { SessionDates } from "./session";
