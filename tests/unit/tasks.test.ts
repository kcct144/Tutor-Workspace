import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Connection } from "mysql2/promise";
import {
  parseTaskQuery,
  parseTaskWrite,
  parseTaskUpdate,
  parseTaskStatus,
} from "../../server/db/task-rules";
import { listTasks, taskSubjects, projectTask } from "../../server/db/tasks";
import { parseMigration } from "../../server/db/safety";
import { requireDevActor } from "../../server/db/dev-actor";
const input = { title: "名称", subject: "科目", description: "说明" };
describe("S5 task rules", () => {
  it("required Unicode fields and boundaries", () => {
    for (const [field, max] of [
      ["title", 160],
      ["subject", 64],
      ["description", 10000],
    ] as const) {
      for (const value of [undefined, null, "", " \n\t", "字".repeat(max + 1)])
        expect(() => parseTaskWrite({ ...input, [field]: value })).toThrow();
      expect(
        [
          ...parseTaskWrite({ ...input, [field]: " 😀".trim().repeat(max) })[
            field
          ],
        ].length,
      ).toBe(max);
    }
    expect(parseTaskWrite({ ...input, description: " \n说明\n " })).toEqual(
      input,
    );
  });
  it("rejects authoritative/unknown fields and invalid versions/status", () => {
    for (const field of [
      "owner",
      "ownerUserId",
      "owner_user_id",
      "actor",
      "actorId",
      "version",
      "id",
      "status",
    ])
      expect(() => parseTaskWrite({ ...input, [field]: "1" })).toThrow();
    for (const status of ["draft", "启用", "disabled ", "", null])
      expect(() =>
        parseTaskStatus({ id: "1", status, expectedVersion: 1 }),
      ).toThrow();
    for (const version of [undefined, 0, -1, 1.5, "1", 4294967296])
      expect(() =>
        parseTaskStatus({
          id: "1",
          status: "enabled",
          expectedVersion: version,
        }),
      ).toThrow();
    for (const id of ["0", "-1", "01", "1 OR 1=1", "18446744073709551616"])
      expect(() =>
        parseTaskStatus({ id, status: "enabled", expectedVersion: 1 }),
      ).toThrow();
    for (const status of ["enabled", "disabled"])
      expect(
        parseTaskUpdate({ ...input, id: "1", status, expectedVersion: 1 })
          .status,
      ).toBe(status);
  });
  it("query pagination and strict filters", () => {
    expect(parseTaskQuery({})).toMatchObject({ page: 1, pageSize: 8 });
    expect(parseTaskQuery({}, true).pageSize).toBe(20);
    for (const q of [
      { page: "0" },
      { page: "1.2" },
      { pageSize: "101" },
      { status: "draft" },
      { subject: "" },
      { keyword: "x".repeat(65) },
      { actor: "1" },
    ])
      expect(() => parseTaskQuery(q)).toThrow();
    expect(() => parseTaskQuery({ status: "enabled" }, true)).toThrow();
  });
  it("only tasks migration allowed; no S6", () => {
    const sql = readFileSync("database/migrations/005_tasks.sql", "utf8");
    expect(parseMigration(sql, ["tasks"], ["users"])).toHaveLength(1);
    expect(sql).not.toMatch(/task_assignments|DROP|ALTER|TRUNCATE/);
    expect(sql).toContain("status IN ('enabled', 'disabled')");
  });
  it("list/options/subjects bounded, escaped, safe projection and fixed counts", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const db = { execute } as unknown as Connection;
    await listTasks(db, {
      page: 2,
      pageSize: 8,
      keyword: "%'_!",
      status: "disabled",
    });
    expect(execute.mock.calls[1]![0]).toContain("LIMIT ? OFFSET ?");
    expect(execute.mock.calls[1]![1]).toEqual([
      "%!%'!_!!%",
      "%!%'!_!!%",
      "%!%'!_!!%",
      "disabled",
      8,
      8,
    ]);
    execute.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await listTasks(db, { page: 1, pageSize: 20 }, true);
    expect(execute.mock.calls[3]![1]).toContain("enabled");
    execute.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await taskSubjects(db, { page: 1, pageSize: 1 });
    expect(execute.mock.calls[5]![0]).toContain("DISTINCT subject");
    const projected = projectTask({
      id: "1",
      title: "t",
      subject: "s",
      description: "d",
      status: "enabled",
      version: 1,
      created_at: "2000-01-01 00:00:00.000",
      updated_at: "2000-01-01 00:00:00.000",
      owner_user_id: "private",
    } as Parameters<typeof projectTask>[0]);
    expect(projected.assignmentCount).toBe(0);
    expect(projected).not.toHaveProperty("owner_user_id");
  });
  it("missing/invalid actor cannot proceed", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue([[]]),
    } as unknown as Connection;
    for (const actor of [undefined, "", "0", "invalid", "18446744073709551615"])
      await expect(requireDevActor(db, actor)).rejects.toMatchObject({
        statusCode: 503,
      });
  });
});
