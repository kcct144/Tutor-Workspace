import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { positiveId } from "./contracts-rules.ts";
import { executeWrite } from "./write.ts";
import type { AccountRole } from "./auth-rules.ts";

export type SessionRevokeReason =
  | "logout"
  | "password_reset"
  | "password_change"
  | "role_change"
  | "account_disabled";

export interface CreateAuthSessionInput {
  userId: string;
  tokenHash: Buffer;
  csrfTokenHash: Buffer;
  createdAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

export interface AuthSessionTokens {
  sessionToken: string;
  csrfToken: string;
}

export interface ActiveAuthSession {
  sessionId: string;
  userId: string;
  name: string;
  username: string;
  role: AccountRole;
  mustChangePassword: boolean;
  csrfTokenHash: Buffer;
}

const idleLifetimeMs = 8 * 60 * 60 * 1000;
const absoluteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function utcDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}

export function opaqueTokenHash(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function issueOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function validOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,128}$/u.test(value);
}

function assertHash(value: Buffer, label: string): Buffer {
  if (!Buffer.isBuffer(value) || value.length !== 32)
    throw new Error(`${label}格式无效。`);
  return value;
}

function assertUtcDateTime(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/u.test(value))
    throw new Error(`${label}格式无效。`);
  return value;
}

export async function createAuthSession(
  connection: Connection,
  input: CreateAuthSessionInput,
): Promise<string> {
  const createdAt = assertUtcDateTime(input.createdAt, "创建时间");
  const idleExpiresAt = assertUtcDateTime(input.idleExpiresAt, "空闲到期时间");
  const absoluteExpiresAt = assertUtcDateTime(
    input.absoluteExpiresAt,
    "绝对到期时间",
  );
  if (idleExpiresAt > absoluteExpiresAt) throw new Error("会话期限无效。");
  const result = await executeWrite(
    connection,
    "INSERT INTO auth_sessions (user_id,token_hash,csrf_token_hash,created_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES (?,?,?,?,?,?,?)",
    [
      positiveId(input.userId),
      assertHash(input.tokenHash, "会话摘要"),
      assertHash(input.csrfTokenHash, "CSRF摘要"),
      createdAt,
      createdAt,
      idleExpiresAt,
      absoluteExpiresAt,
    ],
  );
  return String(result.insertId);
}

/** Creates only opaque-token hashes in MySQL; raw values are returned once for cookies. */
export async function createBrowserSession(
  connection: Connection,
  userId: string,
  now = new Date(),
): Promise<AuthSessionTokens> {
  const sessionToken = issueOpaqueToken();
  const csrfToken = issueOpaqueToken();
  const createdAt = utcDateTime(now);
  const idleExpiresAt = utcDateTime(new Date(now.getTime() + idleLifetimeMs));
  const absoluteExpiresAt = utcDateTime(
    new Date(now.getTime() + absoluteLifetimeMs),
  );
  await createAuthSession(connection, {
    userId,
    tokenHash: opaqueTokenHash(sessionToken),
    csrfTokenHash: opaqueTokenHash(csrfToken),
    createdAt,
    idleExpiresAt,
    absoluteExpiresAt,
  });
  return { sessionToken, csrfToken };
}

function asBoolean(value: unknown): boolean {
  return Number(value) === 1;
}

/** Reads an active session and moves only its idle deadline forward. */
export async function findActiveBrowserSession(
  connection: Connection,
  sessionToken: unknown,
): Promise<ActiveAuthSession | null> {
  if (!validOpaqueToken(sessionToken)) return null;
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT s.id AS session_id,s.user_id,s.csrf_token_hash,u.name,a.username,a.role,a.must_change_password FROM auth_sessions s INNER JOIN user_accounts a ON a.user_id=s.user_id INNER JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.idle_expires_at>UTC_TIMESTAMP(3) AND s.absolute_expires_at>UTC_TIMESTAMP(3) AND a.status='enabled' LIMIT 1",
    [opaqueTokenHash(sessionToken)],
  );
  const row = rows[0];
  if (!row) return null;
  await executeWrite(
    connection,
    "UPDATE auth_sessions SET last_seen_at=UTC_TIMESTAMP(3),idle_expires_at=LEAST(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR),absolute_expires_at) WHERE id=? AND revoked_at IS NULL AND idle_expires_at>UTC_TIMESTAMP(3) AND absolute_expires_at>UTC_TIMESTAMP(3)",
    [String(row.session_id)],
  );
  return {
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    name: String(row.name),
    username: String(row.username),
    role: row.role as AccountRole,
    mustChangePassword: asBoolean(row.must_change_password),
    csrfTokenHash: Buffer.from(row.csrf_token_hash),
  };
}

export function sessionCsrfMatches(
  session: ActiveAuthSession,
  csrfToken: unknown,
): boolean {
  if (!validOpaqueToken(csrfToken)) return false;
  const actual = opaqueTokenHash(csrfToken);
  return (
    actual.length === session.csrfTokenHash.length &&
    timingSafeEqual(actual, session.csrfTokenHash)
  );
}

export async function rotateSessionCsrf(
  connection: Connection,
  sessionId: string,
): Promise<string> {
  const csrfToken = issueOpaqueToken();
  const result = await executeWrite(
    connection,
    "UPDATE auth_sessions SET csrf_token_hash=? WHERE id=? AND revoked_at IS NULL AND idle_expires_at>UTC_TIMESTAMP(3) AND absolute_expires_at>UTC_TIMESTAMP(3)",
    [opaqueTokenHash(csrfToken), positiveId(sessionId)],
  );
  if (result.affectedRows !== 1) throw new Error("会话已失效。");
  return csrfToken;
}

export async function revokeSession(
  connection: Connection,
  sessionId: string,
  reason: SessionRevokeReason = "logout",
): Promise<void> {
  await executeWrite(
    connection,
    "UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3),revoke_reason=? WHERE id=? AND revoked_at IS NULL",
    [reason, positiveId(sessionId)],
  );
}
