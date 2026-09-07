import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  assertAccountRole,
  assertAccountStatus,
  AuthValidationError,
  hashPassword,
  normalizeUsername,
  PasswordHashingUnavailableError,
  validatePassword,
  verifyPassword,
} from "../../server/db/auth-rules.ts";
import { writeAuditLog } from "../../server/db/audit.ts";
import { createAuthSession } from "../../server/db/auth-sessions.ts";
import { bootstrapInitialAdmin } from "../../server/db/auth-accounts.ts";
import {
  parseAuthAccountsMigration,
  parseAuthSessionsMigration,
  parseAuthorizationAuditMigration,
} from "../../server/db/safety.ts";
import {
  parseInitAdminArguments,
  safeBootstrapInputMessage,
  validateBootstrapPassword,
} from "../../database/init-admin.mjs";

const validHash =
  "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("S8.1 native password rules", () => {
  it("normalizes approved usernames and rejects invalid account role or status", () => {
    expect(normalizeUsername(" Admin.User ")).toBe("admin.user");
    for (const value of ["ab", "a b", "账号", "A/1", "a".repeat(65)])
      expect(() => normalizeUsername(value)).toThrow();
    expect(assertAccountRole("admin")).toBe("admin");
    expect(assertAccountStatus("disabled")).toBe("disabled");
    expect(() => assertAccountRole("owner")).toThrow();
    expect(() => assertAccountStatus("locked")).toThrow();
  });

  it("enforces Unicode password bounds without trimming and hashes with Argon2id", async () => {
    const password = " 可靠密码含空格和𠮷字符-2026 ";
    expect(validatePassword(password, "admin.user")).toBe(password);
    for (const value of [
      "短".repeat(14),
      "长".repeat(129),
      "𠮷".repeat(129),
      "x".repeat(513),
      "passwordpassword",
      "admin.user",
    ])
      expect(() => validatePassword(value, "admin.user")).toThrow();
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword(password + "x", hash)).resolves.toBe(false);
    await expect(verifyPassword(password, "not-a-password-hash")).resolves.toBe(
      false,
    );
  });
});

describe("S8.1 local bootstrap command boundary", () => {
  it("has a non-writing help path and requires paired internal write flags", () => {
    expect(parseInitAdminArguments(["--help"])).toEqual({
      help: true,
      apply: false,
    });
    expect(parseInitAdminArguments([])).toEqual({ help: false, apply: false });
    expect(parseInitAdminArguments(["--apply", "--confirm"])).toEqual({
      help: false,
      apply: true,
    });
    expect(() => parseInitAdminArguments(["--apply"])).toThrow();
    expect(() => parseInitAdminArguments(["--username", "admin"])).toThrow();
  });

  it("keeps safe password-input and Argon2 availability errors actionable", () => {
    expect(() =>
      validateBootstrapPassword("local.admin", "不同密码", "另一个密码"),
    ).toThrow("两次密码输入不一致");
    for (const [username, password, expected] of [
      ["local.admin", "短".repeat(14), "密码长度"],
      ["local.admin", "长".repeat(129), "密码长度"],
      ["administrator.local", "administrator.local", "密码不能与账号相同"],
      ["local.admin", "passwordpassword", "密码过于常见"],
    ]) {
      try {
        validateBootstrapPassword(username, password, password);
        throw new Error("预期密码校验失败。");
      } catch (error) {
        expect(safeBootstrapInputMessage(error)).toContain(expected);
      }
    }
    expect(
      safeBootstrapInputMessage(new PasswordHashingUnavailableError()),
    ).toContain("密码哈希能力不可用");
    expect(safeBootstrapInputMessage(new Error("driver details"))).toBeNull();
    expect(
      safeBootstrapInputMessage(new AuthValidationError("安全输入错误。")),
    ).toBe("安全输入错误。未写入。");
  });
});

describe("S8.1 migration allowlist", () => {
  const cases = [
    ["008_auth_accounts.sql", parseAuthAccountsMigration],
    ["009_auth_sessions.sql", parseAuthSessionsMigration],
    ["010_authorization_audit.sql", parseAuthorizationAuditMigration],
  ] as const;
  it.each(cases)("accepts only %s", (name, parser) => {
    const sql = readFileSync(`database/migrations/${name}`, "utf8");
    expect(parser(sql)).not.toHaveLength(0);
    expect(() => parser(sql + " SELECT 1;")).toThrow();
    expect(() => parser(sql.replace("RESTRICT", "CASCADE"))).toThrow();
  });
});

function connection() {
  const query = vi
    .fn()
    .mockResolvedValue([[{ current_database: "tutor_workspace" }]]);
  const execute = vi.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);
  return { db: { query, execute } as never, query, execute };
}

describe("S8.1 DAL input boundaries", () => {
  it("does not write sensitive audit summaries", async () => {
    const state = connection();
    await expect(
      writeAuditLog(state.db, {
        requestId: "00000000-0000-4000-8000-000000000001",
        actorUserId: "1",
        action: "user_account.bootstrap_admin",
        entityType: "user_account",
        entityId: "1",
        after: { role: "admin", status: "enabled" },
      }),
    ).resolves.toBe("1");
    expect(JSON.stringify(state.execute.mock.calls)).not.toContain("password");
    await expect(
      writeAuditLog(state.db, {
        actorUserId: "1",
        action: "student.update",
        entityType: "student",
        entityId: "1",
        after: { guardianPhone: "00000000000" },
      }),
    ).rejects.toThrow();
  });

  it("requires fixed-size session digests and ordered UTC expiry values", async () => {
    const state = connection();
    const input = {
      userId: "1",
      tokenHash: Buffer.alloc(32, 1),
      csrfTokenHash: Buffer.alloc(32, 2),
      createdAt: "2026-09-07 00:00:00.000",
      idleExpiresAt: "2026-09-07 08:00:00.000",
      absoluteExpiresAt: "2026-09-14 00:00:00.000",
    };
    await expect(createAuthSession(state.db, input)).resolves.toBe("1");
    await expect(
      createAuthSession(state.db, { ...input, tokenHash: Buffer.alloc(31) }),
    ).rejects.toThrow();
    await expect(
      createAuthSession(state.db, {
        ...input,
        idleExpiresAt: "2026-09-15 00:00:00.000",
      }),
    ).rejects.toThrow();
  });
});

function bootstrapConnection(options: {
  enabledAdmin?: boolean;
  existingUser?: boolean;
}) {
  const query = vi.fn(async (sql: string) => {
    if (sql === "SELECT DATABASE() AS current_database")
      return [[{ current_database: "tutor_workspace" }]];
    if (sql.includes("role='admin'"))
      return [[{ total: options.enabledAdmin ? 1 : 0 }]];
    return [[]];
  });
  const execute = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.startsWith("SELECT id FROM users"))
      return [options.existingUser ? [{ id: "9" }] : []];
    if (sql.startsWith("INSERT INTO users")) return [{ insertId: 9 }];
    if (sql.startsWith("SELECT user_id FROM user_accounts")) return [[]];
    if (sql.startsWith("INSERT INTO user_accounts")) return [{ insertId: 0 }];
    if (sql.startsWith("INSERT INTO audit_logs")) return [{ insertId: 5 }];
    return [[]];
  });
  return {
    db: {
      query,
      execute,
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    } as never,
    execute,
  };
}

describe("S8.1 bootstrap transaction", () => {
  it("creates a new person and account together only when no enabled administrator exists", async () => {
    const state = bootstrapConnection({});
    await expect(
      bootstrapInitialAdmin(state.db, {
        newUserName: "本机管理员",
        username: "local.admin",
        passwordHash: validHash,
      }),
    ).resolves.toEqual({ createdUser: true });
    expect(
      state.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO users"),
      ),
    ).toBe(true);
    expect(
      state.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO audit_logs"),
      ),
    ).toBe(true);
  });

  it("binds a specified existing person and safely refuses a second enabled administrator", async () => {
    const bound = bootstrapConnection({ existingUser: true });
    await expect(
      bootstrapInitialAdmin(bound.db, {
        existingUserId: "9",
        username: "existing.admin",
        passwordHash: validHash,
      }),
    ).resolves.toEqual({ createdUser: false });
    expect(
      bound.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO users"),
      ),
    ).toBe(false);
    const rejected = bootstrapConnection({ enabledAdmin: true });
    await expect(
      bootstrapInitialAdmin(rejected.db, {
        newUserName: "不会创建",
        username: "another.admin",
        passwordHash: validHash,
      }),
    ).rejects.toThrow("已存在启用管理员");
    expect(
      rejected.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO user_accounts"),
      ),
    ).toBe(false);
  });
});
