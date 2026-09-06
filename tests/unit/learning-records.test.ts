import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import type { Connection } from "mysql2/promise";
import {
  parseRecordWrite,
  parseRecordQuery,
} from "../../server/db/learning-record-rules";
import {
  recordFilter,
  projectRecord,
  updateRecord,
} from "../../server/db/learning-records";
import { parseMigration } from "../../server/db/safety";
const fields = {
  category: "缺",
  content: "学习表现",
  occurredOn: "2026-09-06",
};
describe("S3 learning records", () => {
  it("validates all categories, Unicode trimmed body and Shanghai date boundaries", () => {
    for (const category of ["缺", "补", "强"])
      expect(
        parseRecordWrite(
          { ...fields, studentId: "1", category },
          false,
          "2026-09-06",
        ).category,
      ).toBe(category);
    expect(
      parseRecordWrite(
        {
          ...fields,
          studentId: "1",
          content: " \n" + "😀".repeat(10000) + "\t ",
        },
        false,
        "2026-09-06",
      ).content,
    ).toBe("😀".repeat(10000));
    for (const patch of [
      { category: "其他" },
      { content: " \n\t" },
      { content: "字".repeat(10001) },
      { content: 1 },
      { occurredOn: "2026-09-07" },
      { occurredOn: "2026-02-29" },
      { occurredOn: "2026-13-01" },
    ])
      expect(() =>
        parseRecordWrite(
          { ...fields, studentId: "1", ...patch },
          false,
          "2026-09-06",
        ),
      ).toThrow();
  });
  it("rejects forged authors, versions, binding and invalid IDs", () => {
    for (const key of [
      "author",
      "authorUserId",
      "actorId",
      "version",
      "createdAt",
      "id",
    ])
      expect(() =>
        parseRecordWrite(
          { ...fields, studentId: "1", [key]: "1" },
          false,
          "2026-09-06",
        ),
      ).toThrow();
    for (const key of ["studentId", "authorUserId", "version"])
      expect(() =>
        parseRecordWrite(
          { ...fields, id: "1", expectedVersion: 1, [key]: "2" },
          true,
          "2026-09-06",
        ),
      ).toThrow();
    for (const version of [0, -1, 1.5, "1", 4294967296])
      expect(() =>
        parseRecordWrite(
          { ...fields, id: "1", expectedVersion: version },
          true,
          "2026-09-06",
        ),
      ).toThrow();
    for (const body of [null, [], {}, { ...fields, studentId: "0" }])
      expect(() => parseRecordWrite(body, false, "2026-09-06")).toThrow();
  });
  it("validates paging, combinations and binds literal keyword filters", () => {
    expect(parseRecordQuery({ studentId: "1" })).toMatchObject({
      page: 1,
      pageSize: 5,
    });
    for (const query of [
      {},
      { studentId: ["1"] },
      { studentId: "1", page: "0" },
      { studentId: "1", pageSize: "101" },
      { studentId: "1", category: "无" },
      { studentId: "1", keyword: ["a"] },
      { studentId: "1", authorId: "1" },
      { studentId: "1", dateFrom: "2026-09-07", dateTo: "2026-09-06" },
    ])
      expect(() => parseRecordQuery(query)).toThrow();
    const filter = recordFilter({
      studentId: "1",
      category: "补",
      dateFrom: "2000-01-01",
      dateTo: "2000-01-02",
      keyword: "%'_!",
    });
    expect(filter.values).toEqual([
      "1",
      "补",
      "2000-01-01",
      "2000-01-02",
      "%!%'!_!!%",
    ]);
    expect(filter.sql).not.toContain("%'_!");
  });
  it("migration is only S3 and explicitly constrains fields and references", () => {
    const sql = readFileSync(
      new URL(
        "../../database/migrations/003_learning_records.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(
      parseMigration(sql, ["student_learning_records"], ["students", "users"]),
    ).toHaveLength(1);
    for (const part of [
      "chk_records_category",
      "chk_records_content",
      "chk_records_version",
      "fk_records_student",
      "fk_records_author",
      "idx_records_student_created",
    ])
      expect(sql).toContain(part);
    expect(() =>
      parseMigration(sql, ["contracts"], ["students", "users"]),
    ).toThrow();
    expect(sql).not.toMatch(/deleted_at|history|CURRENT_DATE/i);
  });
  it("projects only public record fields and keeps original binding on version update", async () => {
    const row = {
      id: "1",
      student_id: "2",
      author_user_id: "3",
      author_name: "合成人员",
      category: "缺" as const,
      content: "正文",
      occurred_on: "2000-01-01",
      created_at: "2000-01-01 00:00:00.000",
      updated_at: "2000-01-01 00:00:00.000",
      version: 1,
      password: "private",
      guardian_phone: "private",
    };
    expect(Object.keys(projectRecord(row)).sort()).toEqual(
      [
        "id",
        "studentId",
        "author",
        "category",
        "content",
        "occurredOn",
        "createdAt",
        "updatedAt",
        "version",
      ].sort(),
    );
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[row]]);
    const db = {
      query: vi
        .fn()
        .mockResolvedValue([[{ current_database: "tutor_workspace" }]]),
      execute,
    } as unknown as Connection;
    await expect(
      updateRecord(db, {
        ...fields,
        category: "缺",
        id: "1",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(execute.mock.calls[0]![0]).not.toMatch(
      /SET.*(?:student_id|author_user_id)/,
    );
    expect(execute.mock.calls[0]![0]).toContain("AND version=?");
  });
});
