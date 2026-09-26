import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseHomeQuery } from "../../server/db/assignment-rules";
import { listHome } from "../../server/db/home";
import {
  currentUserProfile,
  parseResponsibleSubjectsUpdate,
  replaceResponsibleSubjects,
} from "../../server/db/responsible-subjects";
import { parseUserResponsibleSubjectsMigration } from "../../server/db/safety";
import { inTransaction } from "../../server/db/pool";

const actor = {
  userId: "7",
  username: "advisor.seven",
  name: "合成学管师",
  role: "advisor" as const,
  mustChangePassword: false,
};

function databaseQuery() {
  return vi.fn(async () => [[{ current_database: "tutor_workspace" }]]);
}

describe("advisor responsible subjects", () => {
  it("normalizes 0-10 exact subjects and rejects invalid requests", () => {
    expect(
      parseResponsibleSubjectsUpdate({
        subjects: [" 英语 ", "数学"],
        expectedVersion: 3,
      }),
    ).toEqual({ subjects: ["英语", "数学"], expectedVersion: 3 });
    expect(
      parseResponsibleSubjectsUpdate({ subjects: [], expectedVersion: 1 }),
    ).toEqual({ subjects: [], expectedVersion: 1 });
    for (const input of [
      { subjects: ["英语", " 英语 "], expectedVersion: 1 },
      { subjects: [""], expectedVersion: 1 },
      { subjects: ["科".repeat(65)], expectedVersion: 1 },
      {
        subjects: Array.from({ length: 11 }, (_, index) => `科目${index}`),
        expectedVersion: 1,
      },
      { subjects: ["英语"], expectedVersion: 0 },
      { subjects: ["英语"], expectedVersion: 1, userId: "8" },
    ])
      expect(() => parseResponsibleSubjectsUpdate(input)).toThrow();
  });

  it("reads the current account version and only that user's bounded subjects", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ version: 4, status: "enabled" }]])
      .mockResolvedValueOnce([[{ subject: "数学" }, { subject: "英语" }]]);
    await expect(
      currentUserProfile({ execute } as never, actor),
    ).resolves.toMatchObject({
      id: "7",
      version: 4,
      responsibleSubjects: ["数学", "英语"],
    });
    expect(execute.mock.calls[1]?.[0]).toContain("WHERE user_id=?");
    expect(execute.mock.calls[1]?.[0]).toContain("LIMIT 10");
    expect(execute.mock.calls[1]?.[1]).toEqual(["7"]);
  });

  it("replaces subjects, increments the shared account version, and audits in one transaction", async () => {
    const timeline: string[] = [];
    const execute = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT version,status"))
        return [[{ version: 2, status: "enabled" }]];
      if (sql.startsWith("SELECT subject")) return [[{ subject: "英语" }]];
      if (sql.startsWith("DELETE FROM user_responsible_subjects")) {
        timeline.push("delete");
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO user_responsible_subjects")) {
        timeline.push("insert");
        expect(values).toEqual(["7", "数学", "7", "物理"]);
        return [{ affectedRows: 2 }];
      }
      if (sql.startsWith("UPDATE user_accounts")) {
        timeline.push("version");
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO audit_logs")) {
        timeline.push("audit");
        expect(values?.[2]).toBe("user_account.responsible_subjects.update");
        expect(String(values?.[6])).not.toMatch(/password|token|phone/iu);
        return [{ insertId: 1, affectedRows: 1 }];
      }
      return [[]];
    });
    const db = {
      query: databaseQuery(),
      execute,
      beginTransaction: vi.fn(async () => timeline.push("begin")),
      commit: vi.fn(async () => timeline.push("commit")),
      rollback: vi.fn(async () => timeline.push("rollback")),
    };
    await expect(
      inTransaction(db as never, () =>
        replaceResponsibleSubjects(db as never, actor, {
          subjects: ["数学", "物理"],
          expectedVersion: 2,
        }),
      ),
    ).resolves.toMatchObject({
      version: 3,
      responsibleSubjects: ["数学", "物理"],
    });
    expect(timeline).toEqual([
      "begin",
      "delete",
      "insert",
      "version",
      "audit",
      "commit",
    ]);
  });

  it("returns 409 before replacement when the account version is stale", async () => {
    const execute = vi.fn(async (sql: string) =>
      sql.startsWith("SELECT version,status")
        ? [[{ version: 5, status: "enabled" }]]
        : [[]],
    );
    await expect(
      replaceResponsibleSubjects({ execute } as never, actor, {
        subjects: ["英语"],
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", statusCode: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("responsible-subject home filtering", () => {
  it("uses advisor scope, multiple subjects as OR, and grade/tag as AND", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 8 }]])
      .mockResolvedValueOnce([[{ subject: "英语" }, { subject: "数学" }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const page = await listHome(
      { execute } as never,
      parseHomeQuery({ grade: "初三", tag: "重点" }),
      actor,
      "2026-09-14",
    );
    expect(page).toMatchObject({
      activeStudents: 8,
      total: 0,
      subjectConfigurationRequired: false,
    });
    const sql = String(execute.mock.calls[2]?.[0]);
    const values = execute.mock.calls[2]?.[1];
    expect(sql).toContain("owner_user_id=?");
    expect(sql).toContain("student_tags");
    expect(sql).toContain("EXISTS (SELECT 1 FROM contracts");
    expect(sql).toContain("c.subject COLLATE utf8mb4_0900_bin IN (?,?)");
    expect(sql).toContain("c.contract_type = 'trial'");
    expect(values).toEqual([
      "7",
      "初三",
      "重点",
      "英语",
      "数学",
      "2026-09-14",
      "2026-09-14",
      "2026-09-14",
      "2026-09-14",
    ]);
  });

  it("returns an empty configured-state page without silently widening scope", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[]]);
    await expect(
      listHome({ execute } as never, parseHomeQuery({}), actor, "2026-09-14"),
    ).resolves.toMatchObject({
      activeStudents: 3,
      total: 0,
      items: [],
      subjectConfigurationRequired: true,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("lets admin clear the view filter without changing the active count scope", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 20 }]])
      .mockResolvedValueOnce([[{ total: 20 }]])
      .mockResolvedValueOnce([[]]);
    const page = await listHome(
      { execute } as never,
      parseHomeQuery({ subjectMode: "all" }),
      { ...actor, role: "admin" },
      "2026-09-14",
    );
    expect(page).toMatchObject({ activeStudents: 20, total: 20 });
    expect(String(execute.mock.calls[1]?.[0])).not.toContain("contracts c");
    expect(String(execute.mock.calls[1]?.[0])).not.toContain("owner_user_id");
  });

  it("validates selected mode and repeated normalized subjects", () => {
    expect(
      parseHomeQuery({ subjectMode: "selected", subject: ["英语", "数学"] }),
    ).toMatchObject({ subjectMode: "selected", subject: ["英语", "数学"] });
    for (const query of [
      { subjectMode: "selected" },
      { subjectMode: "selected", subject: ["英语", " 英语 "] },
      { subjectMode: "all", subject: "英语" },
      { subjectMode: "unknown" },
    ])
      expect(() => parseHomeQuery(query)).toThrow();
  });
});

describe("responsible-subject migration and API boundary", () => {
  it("accepts only the additive 020 relation with exact indexes and RESTRICT FK", () => {
    const sql = readFileSync(
      "database/migrations/020_user_responsible_subjects.sql",
      "utf8",
    );
    expect(parseUserResponsibleSubjectsMigration(sql)).toHaveLength(1);
    expect(sql).toContain("PRIMARY KEY (user_id, subject)");
    expect(sql).toContain("(subject, user_id)");
    expect(sql).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(() =>
      parseUserResponsibleSubjectsMigration(sql + " DELETE FROM users;"),
    ).toThrow();
  });

  it("keeps the settings route behind global session and CSRF middleware", () => {
    const middleware = readFileSync("server/middleware/auth.ts", "utf8");
    const route = readFileSync(
      "server/api/auth/me/responsible-subjects.patch.ts",
      "utf8",
    );
    expect(middleware).not.toContain("responsible-subjects");
    expect(middleware).toContain("sessionCsrfMatches");
    expect(route).toContain("requireActiveAuth");
    expect(route).toContain("inTransaction");
  });
});
