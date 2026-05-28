import { createHash, randomBytes } from "node:crypto";
import { prisma, type UserRole } from "@flowstate/db";
import { AuthError } from "./errors.js";

export const ADMIN_SESSION_COOKIE_NAME = "flowstate_admin_session";
export const MEMBER_SESSION_COOKIE_NAME = "flowstate_member_session";
export const SESSION_COOKIE_NAME = ADMIN_SESSION_COOKIE_NAME;
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionCookieStore {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: {
      expires: Date;
      httpOnly: boolean;
      path: string;
      sameSite: "lax";
      secure: boolean;
    },
  ): void;
}

export interface AppSession {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string | null;
  role: UserRole | null;
}

export interface StoredSessionRecord {
  userId: string;
  expiresAt: Date;
  email: string;
  fullName: string | null;
  memberships: Array<{
    workspaceId: string;
    role: UserRole;
    createdAt: Date;
  }>;
}

export interface SessionRepository {
  create(args: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredSessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

interface SessionCookieOptions {
  cookieName?: string;
}

export const prismaSessionRepository: SessionRepository = {
  async create({ userId, tokenHash, expiresAt }) {
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  },
  async findByTokenHash(tokenHash) {
    const record = await prisma.authSession.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            workspaceUsers: {
              where: {
                isActive: true,
              },
              orderBy: {
                createdAt: "asc",
              },
              select: {
                workspaceId: true,
                role: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    return {
      userId: record.userId,
      expiresAt: record.expiresAt,
      email: record.user.email,
      fullName: record.user.fullName,
      memberships: record.user.workspaceUsers,
    };
  },
  async deleteByTokenHash(tokenHash) {
    await prisma.authSession.deleteMany({
      where: {
        tokenHash,
      },
    });
  },
};

export function normalizeDisplayName(
  fullName: string | null | undefined,
  email: string,
): string {
  const trimmedName = fullName?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  return email;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getCookieName(cookieName?: string): string {
  return cookieName?.trim() || SESSION_COOKIE_NAME;
}

export function clearSessionCookie(
  cookieStore: SessionCookieStore,
  options?: SessionCookieOptions,
): void {
  cookieStore.set(getCookieName(options?.cookieName), "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function setSessionCookie(
  cookieStore: SessionCookieStore,
  token: string,
  expiresAt: Date,
  options?: SessionCookieOptions,
): void {
  cookieStore.set(getCookieName(options?.cookieName), token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function buildAppSession(
  record: StoredSessionRecord,
): AppSession | null {
  if (record.memberships.length > 1) {
    return null;
  }

  const membership = record.memberships[0];

  return {
    userId: record.userId,
    email: record.email,
    displayName: normalizeDisplayName(record.fullName, record.email),
    workspaceId: membership?.workspaceId ?? null,
    role: membership?.role ?? null,
  };
}

export async function createSession(args: {
  userId: string;
  cookieStore: SessionCookieStore;
  repository?: SessionRepository;
  cookieName?: string;
}): Promise<void> {
  const repository = args.repository ?? prismaSessionRepository;
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await repository.create({
    userId: args.userId,
    tokenHash,
    expiresAt,
  });

  setSessionCookie(args.cookieStore, token, expiresAt, {
    cookieName: args.cookieName,
  });
}

export async function getSessionFromToken(args: {
  token: string;
  repository?: SessionRepository;
}): Promise<AppSession | null> {
  if (!args.token) {
    return null;
  }

  const repository = args.repository ?? prismaSessionRepository;
  const record = await repository.findByTokenHash(hashSessionToken(args.token));

  if (!record) {
    return null;
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await repository.deleteByTokenHash(hashSessionToken(args.token));
    return null;
  }

  return buildAppSession(record);
}

export async function getSession(args: {
  cookieStore: SessionCookieStore;
  repository?: SessionRepository;
  cookieName?: string;
}): Promise<AppSession | null> {
  const token =
    args.cookieStore.get(getCookieName(args.cookieName))?.value?.trim() ?? "";
  const session = await getSessionFromToken({
    token,
    repository: args.repository,
  });

  return session;
}

export async function deleteSession(args: {
  cookieStore: SessionCookieStore;
  repository?: SessionRepository;
  cookieName?: string;
}): Promise<void> {
  const repository = args.repository ?? prismaSessionRepository;
  const token =
    args.cookieStore.get(getCookieName(args.cookieName))?.value?.trim() ?? "";

  if (token) {
    await repository.deleteByTokenHash(hashSessionToken(token));
  }

  clearSessionCookie(args.cookieStore, {
    cookieName: args.cookieName,
  });
}

export async function requireUser(args: {
  cookieStore: SessionCookieStore;
  repository?: SessionRepository;
  cookieName?: string;
}): Promise<AppSession> {
  const session = await getSession(args);

  if (!session) {
    throw new AuthError("UNAUTHENTICATED", "A valid session is required.");
  }

  return session;
}

export async function requireRole(args: {
  allowedRoles: UserRole[];
  cookieStore: SessionCookieStore;
  repository?: SessionRepository;
  cookieName?: string;
}): Promise<AppSession> {
  const session = await requireUser(args);

  if (!session.workspaceId || !session.role) {
    throw new AuthError(
      "ONBOARDING_REQUIRED",
      "A workspace is required before accessing this route.",
    );
  }

  if (!args.allowedRoles.includes(session.role)) {
    throw new AuthError(
      "UNAUTHORIZED",
      "Your role cannot access this route.",
    );
  }

  return session;
}
