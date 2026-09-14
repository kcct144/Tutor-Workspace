import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { normalizeStudentTags } from "../../types/api/student-tags";
import {
  parseStudentTagsWrite,
  saveStudentTags,
  listStudentTagOptions,
} from "../../server/db/student-tags";
import { parseHomeQuery } from "../../server/db/assignment-rules";
import { listHome } from "../../server/db/home";
import { parseMigration } from "../../server/db/safety";
import { inTransaction } from "../../server/db/pool";

class MemoryTags {
  tags = ["原标签"];
  version = 1;
  audits = 0;
  failAudit = false;
  backup = { tags: [] as string[], version: 1, audits: 0 };
  async query() {
    return [[{ current_database: "tutor_workspace" }]];
  }
  async beginTransaction() {
    this.backup = {
      tags: [...this.tags],
      version: this.version,
      audits: this.audits,
    };
  }
  async commit() {}
  async rollback() {
    Object.assign(this, this.backup);
  }
  async execute(sql: string, values: unknown[] = []) {
    if (sql.startsWith("SELECT id,version"))
      return [[{ id: "1", version: this.version }]];
    if (sql.startsWith("SELECT student_id,tag"))
      return [this.tags.map((tag) => ({ student_id: "1", tag }))];
    if (sql.startsWith("UPDATE students")) this.version++;
    if (sql.startsWith("DELETE FROM student_tags")) this.tags = [];
    if (sql.startsWith("INSERT INTO student_tags"))
      this.tags = values.filter((_v, i) => i % 2 === 1) as string[];
    if (sql.startsWith("INSERT INTO audit_logs")) {
      if (this.failAudit) throw new Error("模拟审计失败");
      this.audits++;
    }
    return [{ affectedRows: 1, insertId: 1 }];
  }
}
const write = (db: MemoryTags, tags: string[], expectedVersion = 1) =>
  inTransaction(db as never, () =>
    saveStudentTags(db as never, { id: "1", tags, expectedVersion }, "1"),
  );

describe("student tags", () => {
  it("normalizes unicode and duplicates and validates limits and authoritative fields", () => {
    expect(normalizeStudentTags([" 体验 ", "体验", "e\u0301", "é"])).toEqual([
      "é",
      "体验",
    ]);
    expect(normalizeStudentTags(["😀".repeat(24)])).toHaveLength(1);
    for (const tags of [
      [""],
      ["x".repeat(25)],
      Array(11).fill("标签"),
      ["a\nb"],
      [null],
      "标签",
    ])
      expect(() => normalizeStudentTags(tags)).toThrow();
    expect(() =>
      parseStudentTagsWrite({
        id: "1",
        tags: [],
        expectedVersion: 1,
        actorId: "2",
      }),
    ).toThrow();
    expect(() =>
      parseStudentTagsWrite({ id: "0", tags: [], expectedVersion: 1 }),
    ).toThrow();
    expect(() =>
      parseStudentTagsWrite({ id: "1", tags: [], expectedVersion: 0 }),
    ).toThrow();
  });
  it("saves and reads back, rejects stale edits, and permits explicit removal", async () => {
    const db = new MemoryTags();
    expect(await write(db, ["体验", "周末"])).toEqual({
      id: "1",
      tags: ["体验", "周末"],
      version: 2,
    });
    await expect(write(db, ["旧窗口"], 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(db.tags).toEqual(["体验", "周末"]);
    await write(db, ["周末", "体验"], 2);
    expect(db.version).toBe(2);
    expect(db.audits).toBe(1);
    await write(db, [], 2);
    expect(db.tags).toEqual([]);
  });
  it("rolls back tags and student version together on audit failure and rejects overflow", async () => {
    const db = new MemoryTags();
    db.failAudit = true;
    await expect(write(db, ["新标签"])).rejects.toThrow("模拟审计失败");
    expect(db.tags).toEqual(["原标签"]);
    expect(db.version).toBe(1);
    db.version = 4294967295;
    await expect(write(db, [], db.version)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });
  it("filters home by grade AND exact tag with server pagination and independent active count", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 12 }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const query = parseHomeQuery({
      grade: "初一",
      tag: "体验' OR 1=1",
      page: "2",
    });
    expect(
      await listHome({ execute } as never, query, {
        role: "admin",
        userId: "1",
      }),
    ).toMatchObject({
      total: 0,
      activeStudents: 12,
      page: 2,
      items: [],
    });
    expect(execute.mock.calls[0]![0]).not.toContain("student_tags");
    expect(execute.mock.calls[1]![0]).toContain("EXISTS");
    expect(execute.mock.calls[2]![1]).toEqual(["初一", "体验' OR 1=1", 20, 20]);
    expect(() => parseHomeQuery({ tag: ["x"] })).toThrow();
    expect(() => parseHomeQuery({ tag: "x", page: "0" })).toThrow();
  });
  it("serves bounded tag options with wildcard escaping", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ tag: "100%" }]]);
    expect(
      await listStudentTagOptions({ execute } as never, {
        keyword: "%",
        page: "2",
        pageSize: "10",
      }),
    ).toMatchObject({ total: 1, items: [{ value: "100%", label: "100%" }] });
    expect(execute.mock.calls[1]![1]).toEqual(["%!%%", 10, 10]);
  });
  it("restricts migration to additive tag table and student foreign key", () => {
    const sql = readFileSync(
      "database/migrations/019_student_tags.sql",
      "utf8",
    );
    expect(parseMigration(sql, ["student_tags"], ["students"])).toHaveLength(1);
    expect(() =>
      parseMigration(
        sql + " DELETE FROM students;",
        ["student_tags"],
        ["students"],
      ),
    ).toThrow();
    expect(sql).toContain("PRIMARY KEY (student_id, tag)");
    expect(sql).toContain("ON DELETE RESTRICT");
  });
});
