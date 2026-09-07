import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export const accountRoles = ["admin", "advisor"] as const;
export const accountStatuses = ["enabled", "disabled"] as const;
export type AccountRole = (typeof accountRoles)[number];
export type AccountStatus = (typeof accountStatuses)[number];

const argon2Parameters = {
  memory: 19456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
} as const;
const weakPasswords = new Set([
  "123456789012345",
  "passwordpassword",
  "qwertyuiopasdfgh",
  "adminadminadmin",
  "letmeinletmein1",
]);

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}

/** Safe to surface locally: it identifies an unavailable primitive, never its cause. */
export class PasswordHashingUnavailableError extends Error {
  constructor() {
    super("本机密码哈希能力不可用，请确认 Node.js 24 的安全组件可用后重试。");
    this.name = "PasswordHashingUnavailableError";
  }
}

function invalid(message: string): never {
  throw new AuthValidationError(message);
}

export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") invalid("账号格式无效。");
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username))
    invalid("账号须为3至64位小写ASCII字母、数字、点、下划线或连字符。");
  return username;
}

export function normalizeUserName(value: unknown): string {
  if (typeof value !== "string") invalid("人员姓名格式无效。");
  const name = value.trim();
  if (!name || [...name].length > 64) invalid("人员姓名长度无效。");
  return name;
}

export function assertAccountRole(value: unknown): AccountRole {
  if (!accountRoles.includes(value as AccountRole)) invalid("账号角色无效。");
  return value as AccountRole;
}

export function assertAccountStatus(value: unknown): AccountStatus {
  if (!accountStatuses.includes(value as AccountStatus))
    invalid("账号状态无效。");
  return value as AccountStatus;
}

export function validatePassword(password: unknown, username: string): string {
  if (typeof password !== "string") invalid("密码格式无效。");
  const characters = [...password].length;
  if (characters < 15 || characters > 128)
    invalid("密码长度须为15至128个字符。");
  if (Buffer.byteLength(password, "utf8") > 512)
    invalid("密码UTF-8长度不能超过512字节。");
  if (password.toLowerCase() === username) invalid("密码不能与账号相同。");
  if (weakPasswords.has(password.toLowerCase()))
    invalid("密码过于常见，请更换。");
  return password;
}

function encodePhcPart(value: Buffer): string {
  return value.toString("base64").replace(/=+$/u, "");
}

function decodePhcPart(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64");
    return encodePhcPart(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

interface ParsedPasswordHash {
  salt: Buffer;
  tag: Buffer;
}

function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const match =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/u.exec(
      value,
    );
  if (!match) return null;
  if (
    Number(match[1]) !== argon2Parameters.memory ||
    Number(match[2]) !== argon2Parameters.passes ||
    Number(match[3]) !== argon2Parameters.parallelism
  )
    return null;
  const salt = decodePhcPart(match[4]!);
  const tag = decodePhcPart(match[5]!);
  if (
    !salt ||
    !tag ||
    salt.length < 16 ||
    tag.length !== argon2Parameters.tagLength
  )
    return null;
  return { salt, tag };
}

function deriveArgon2id(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: Buffer.from(password, "utf8"),
        nonce: salt,
        ...argon2Parameters,
      },
      (error, tag) => {
        if (error) reject(error);
        else resolve(tag);
      },
    );
  });
}

/** Hashes with Node 24's native Argon2id; no external password package is used. */
export async function hashPassword(password: string): Promise<string> {
  try {
    const salt = randomBytes(16);
    const tag = await deriveArgon2id(password, salt);
    return `$argon2id$v=19$m=${argon2Parameters.memory},t=${argon2Parameters.passes},p=${argon2Parameters.parallelism}$${encodePhcPart(salt)}$${encodePhcPart(tag)}`;
  } catch {
    throw new PasswordHashingUnavailableError();
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;
  const actual = await deriveArgon2id(password, parsed.salt);
  return timingSafeEqual(actual, parsed.tag);
}

export function isSupportedPasswordHash(value: unknown): value is string {
  return typeof value === "string" && parsePasswordHash(value) !== null;
}
