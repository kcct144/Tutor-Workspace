import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { authenticateAccount } from "../../server/db/auth-accounts.ts";
import {
  createBrowserSession,
  findActiveBrowserSession,
  issueOpaqueToken,
  opaqueTokenHash,
  sessionCsrfMatches,
  validOpaqueToken,
} from "../../server/db/auth-sessions.ts";
import { hashPassword } from "../../server/db/auth-rules.ts";

function approvedQuery() {
  return vi.fn(async () => [[{ current_database: "tutor_workspace" }]]);
}

describe("S8.2 opaque-session primitives", () => {
  it("keeps raw session and CSRF values outside their SHA-256 persistence projection", async () => {
    const token = issueOpaqueToken();
    const csrf = issueOpaqueToken();
    expect(validOpaqueToken(token)).toBe(true);
    expect(validOpaqueToken("forged")).toBe(false);
    expect(opaqueTokenHash(token)).toHaveLength(32);
    expect(token).not.toContain(opaqueTokenHash(token).toString("hex"));
    expect(
      sessionCsrfMatches(
        {
          sessionId: "1",
          userId: "2",
          name: "受控用户",
          username: "local.admin",
          role: "admin",
          mustChangePassword: false,
          csrfTokenHash: opaqueTokenHash(csrf),
        },
        csrf,
      ),
    ).toBe(true);
    expect(
      sessionCsrfMatches(
        {
          sessionId: "1",
          userId: "2",
          name: "受控用户",
          username: "local.admin",
          role: "admin",
          mustChangePassword: false,
          csrfTokenHash: opaqueTokenHash(csrf),
        },
        issueOpaqueToken(),
      ),
    ).toBe(false);
  });

  it("creates the browser session before a successful authentication transaction commits", async () => {
    const passwordHash = await hashPassword("可验证的本机密码-2026");
    const timeline: string[] = [];
    const query = approvedQuery();
    const execute = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT a.user_id"))
        return [
          [
            {
              user_id: "2",
              name: "受控用户",
              username: "local.admin",
              password_hash: passwordHash,
              role: "admin",
              status: "enabled",
              must_change_password: 0,
              failed_login_count: 0,
              failed_window_started_at: null,
              locked_until: null,
              is_locked: 0,
              in_failure_window: 0,
            },
          ],
        ];
      if (sql.startsWith("UPDATE user_accounts")) {
        timeline.push("account");
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO auth_sessions")) {
        timeline.push("session");
        return [{ insertId: 9, affectedRows: 1 }];
      }
      return [[]];
    });
    const db = {
      query,
      execute,
      beginTransaction: vi.fn(async () => timeline.push("begin")),
      commit: vi.fn(async () => timeline.push("commit")),
      rollback: vi.fn(async () => timeline.push("rollback")),
    } as never;
    let tokens: Awaited<ReturnType<typeof createBrowserSession>> | undefined;
    await expect(
      authenticateAccount(
        db,
        { username: "LOCAL.ADMIN", password: "可验证的本机密码-2026" },
        async (account) => {
          tokens = await createBrowserSession(db, account.userId);
        },
      ),
    ).resolves.toMatchObject({ username: "local.admin", role: "admin" });
    expect(tokens?.sessionToken).toBeDefined();
    expect(timeline).toEqual(["begin", "account", "session", "commit"]);
  });

  it("rejects an expired or forged session before it can become request context", async () => {
    const query = approvedQuery();
    const execute = vi.fn(async () => [[]]);
    const db = { query, execute } as never;
    await expect(
      findActiveBrowserSession(db, issueOpaqueToken()),
    ).resolves.toBe(null);
    expect(String(execute.mock.calls[0]?.[0])).toContain(
      "s.idle_expires_at>UTC_TIMESTAMP(3)",
    );
    expect(String(execute.mock.calls[0]?.[0])).toContain(
      "s.absolute_expires_at>UTC_TIMESTAMP(3)",
    );
    await expect(findActiveBrowserSession(db, "forged")).resolves.toBe(null);
  });

  it("uses the same invalid-credential envelope for a wrong password", async () => {
    const passwordHash = await hashPassword("可验证的本机密码-2026");
    const query = approvedQuery();
    const db = {
      query,
      execute: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT a.user_id"))
          return [
            [
              {
                user_id: "2",
                name: "受控用户",
                username: "local.admin",
                password_hash: passwordHash,
                role: "admin",
                status: "enabled",
                must_change_password: 0,
                failed_login_count: 0,
                failed_window_started_at: null,
                locked_until: null,
                is_locked: 0,
                in_failure_window: 0,
              },
            ],
          ];
        return [{ affectedRows: 1 }];
      }),
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    } as never;
    await expect(
      authenticateAccount(db, {
        username: "local.admin",
        password: "错误密码也不会泄露账号状态",
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });
});

describe("S8.2 global API boundary", () => {
  it("keeps only login and health public, with server-side CSRF and account checks", () => {
    const middleware = readFileSync("server/middleware/auth.ts", "utf8");
    expect(middleware).toContain(
      'path === "/api/auth/login" && method === "POST"',
    );
    expect(middleware).toContain('path === "/api/health" && method === "GET"');
    expect(middleware).toContain("findActiveBrowserSession");
    expect(middleware).toContain("sessionCsrfMatches");
    expect(middleware).toContain("CSRF_INVALID");
    const cookies = readFileSync("server/auth/cookies.ts", "utf8");
    expect(cookies).toContain('sameSite: "strict"');
    expect(cookies).toContain("httpOnly: true");
    expect(cookies).toContain('path: "/"');
    expect(cookies).not.toContain("domain:");
  });

  it("replaces every current business write route's DEV_ACTOR identity read", () => {
    const writes = [
      "contracts/create.post.ts",
      "contracts/update.patch.ts",
      "learning-records/create.post.ts",
      "learning-records/update.patch.ts",
      "students/create.post.ts",
      "students/update.patch.ts",
      "students/status.patch.ts",
      "study-plans/update.patch.ts",
      "tasks/create.post.ts",
      "tasks/update.patch.ts",
      "tasks/status.patch.ts",
      "task-assignments/create-batch.post.ts",
      "task-assignments/completion.patch.ts",
    ];
    for (const file of writes) {
      const source = readFileSync(`server/api/${file}`, "utf8");
      expect(source).toContain("requireActiveAuth");
      expect(source).not.toContain("devActorId");
    }
  });
});
