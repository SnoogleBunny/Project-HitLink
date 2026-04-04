export { AuthError, isAuthError, type AuthErrorCode } from "./errors.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  buildAppSession,
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  getSessionFromToken,
  hashSessionToken,
  normalizeDisplayName,
  prismaSessionRepository,
  requireRole,
  requireUser,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  setSessionCookie,
  type AppSession,
  type SessionCookieStore,
  type SessionRepository,
  type StoredSessionRecord,
} from "./session.js";
