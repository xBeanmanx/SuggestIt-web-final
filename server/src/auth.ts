import { createHash, randomBytes } from "crypto";
import { createRequire } from "module";
import { v4 as uuid } from "uuid";
import type { AppRoleName, IStore, User } from "./types.js";

const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken") as {
  sign(payload: object, secret: string, options: object): string;
  verify(token: string, secret: string): JwtPayload;
};

export interface JwtPayload {
  userId: string;
  role: AppRoleName;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_DAYS = 7;
export const REFRESH_COOKIE_NAME = "si_refresh_token";
const DEFAULT_JWT_SECRET = "suggestit-local-dev-secret-change-me";
const MIN_JWT_SECRET_LENGTH = 32;
const MFA_MAX_ATTEMPTS = 5;
const signedFlowTokens = new Map<string, { userId: string; type: "magic" | "password-reset"; expiresAt: number }>();
const mfaChallenges = new Map<string, { userId: string; code: string; expiresAt: number; attempts: number }>();

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  const isLocalDev = process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_DEV_SECRET !== "false";
  const usesDefaultSecret = secret === DEFAULT_JWT_SECRET;

  if ((!isLocalDev && usesDefaultSecret) || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to a non-default value with at least ${MIN_JWT_SECRET_LENGTH} characters.`
    );
  }

  return secret;
}

export function signAccessToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role ?? "USER",
      permissions: user.permissions ?? [],
    },
    jwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, jwtSecret());
}

export function createRefreshTokenValue(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000);
}

export async function issueRefreshToken(store: IStore, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = createRefreshTokenValue();
  const expiresAt = refreshExpiryDate();
  await store.createRefreshToken({
    id: uuid(),
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdAt: new Date().toISOString(),
  });
  return { token, expiresAt };
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        const rawName = index === -1 ? part : part.slice(0, index);
        const rawValue = index === -1 ? "" : part.slice(index + 1);
        try {
          return [decodeURIComponent(rawName), decodeURIComponent(rawValue)];
        } catch {
          return [rawName, rawValue];
        }
      })
  );
}

function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === "production" || process.env.DISABLE_HTTPS !== "true";
}

export function refreshCookie(token: string, expiresAt: Date): string {
  return [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    shouldUseSecureCookies() ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearRefreshCookie(): string {
  return [
    `${REFRESH_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    shouldUseSecureCookies() ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function pruneExpiredSignedFlowTokens(now = Date.now()): void {
  for (const [tokenHash, record] of signedFlowTokens) {
    if (record.expiresAt <= now) signedFlowTokens.delete(tokenHash);
  }
}

function pruneExpiredMfaChallenges(now = Date.now()): void {
  for (const [challengeHash, challenge] of mfaChallenges) {
    if (challenge.expiresAt <= now) mfaChallenges.delete(challengeHash);
  }
}

export function createSignedFlowToken(userId: string, type: "magic" | "password-reset", ttlMs = 10 * 60_000): string {
  pruneExpiredSignedFlowTokens();
  const token = createRefreshTokenValue();
  signedFlowTokens.set(hashRefreshToken(token), {
    userId,
    type,
    expiresAt: Date.now() + ttlMs,
  });
  return token;
}

export function consumeSignedFlowToken(token: string, type: "magic" | "password-reset"): string | undefined {
  const tokenHash = hashRefreshToken(token);
  const record = signedFlowTokens.get(tokenHash);
  signedFlowTokens.delete(tokenHash);
  if (!record || record.type !== type || record.expiresAt <= Date.now()) return undefined;
  return record.userId;
}

export function createMfaChallenge(userId: string, ttlMs = 5 * 60_000): {
  challengeId: string;
  demoCode: string;
  expiresAt: Date;
} {
  pruneExpiredMfaChallenges();
  const challengeId = createRefreshTokenValue();
  const demoCode = randomBytes(3).readUIntBE(0, 3).toString().slice(0, 6).padStart(6, "0");
  const expiresAt = new Date(Date.now() + ttlMs);
  mfaChallenges.set(hashRefreshToken(challengeId), {
    userId,
    code: demoCode,
    expiresAt: expiresAt.getTime(),
    attempts: 0,
  });
  return { challengeId, demoCode, expiresAt };
}

export function consumeMfaChallenge(challengeId: string, code: string): string | undefined {
  const challengeHash = hashRefreshToken(challengeId);
  const challenge = mfaChallenges.get(challengeHash);
  if (!challenge) return undefined;

  if (challenge.expiresAt <= Date.now()) {
    mfaChallenges.delete(challengeHash);
    return undefined;
  }

  challenge.attempts += 1;
  if (challenge.code !== code.trim()) {
    if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
      mfaChallenges.delete(challengeHash);
    } else {
      mfaChallenges.set(challengeHash, challenge);
    }
    return undefined;
  }

  mfaChallenges.delete(challengeHash);
  return challenge.userId;
}
