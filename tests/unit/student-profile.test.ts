import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Connection } from "mysql2/promise";
import { parseStudentOptionIds } from "../../server/db/student-query";
import {
  parseStudentCreate,
  parseStudentUpdate,
  parseStudentStatus,
  maskGuardianPhone,
} from "../../server/db/student-profile-rules";
import {
  parseMigration,
  parseStudentVersionMigration,
} from "../../server/db/safety";
import {
  createStudent,
  updateStudent,
  findStudentEdit,
} from "../../server/db/student-profile";
vi.mock("../../server/db/students.ts", () => ({
  findStudent: vi.fn(async () => ({
    id: "1",
    guardianPhoneMasked: "000****0000",
  })),
}));
const minimal = { name: "合成", grade: "初一" };
describe("S7 profile validation", () => {
  it("selected-label refresh is strictly bounded and rejects mixed/invalid inputs", () => {
    expect(parseStudentOptionIds({ ids: "1,2" })).toEqual(["1", "2"]);
    for (const input of [
      { ids: "" },
      { ids: "1,1" },
      { ids: "1 OR 1=1" },
      { ids: ["1"] },
      { ids: "1", keyword: "x" },
      { ids: Array.from({ length: 101 }, (_, i) => String(i + 1)).join(",") },
    ])
      expect(() => parseStudentOptionIds(input)).toThrow();
  });
  it("accepts minimal, trims Unicode and normalizes nullable fields", () => {
    expect(parseStudentCreate(minimal)).toMatchObject({
      name: "合成",
      guardianPhone: null,
      enrolledAt: null,
    });
    expect(
      parseStudentCreate({ ...minimal, name: " " + "𠮷".repeat(64) + " " })
        .name,
    ).toHaveLength(128);
    expect(parseStudentCreate({ name: "年级待确认学生" })).toMatchObject({
      name: "年级待确认学生",
      grade: null,
    });
    for (const grade of ["三年级", "高三"])
      expect(parseStudentCreate({ name: "扩展年级", grade }).grade).toBe(grade);
    expect(
      parseStudentCreate({
        ...minimal,
        enrolledAt: "1900-01-01",
        guardianPhone: " +00 (000) 000-000 ",
      }).guardianPhone,
    ).toBe("+00 (000) 000-000");
    expect(
      parseStudentCreate({ ...minimal, enrolledAt: "2026-09-06" }, "2026-09-06")
        .enrolledAt,
    ).toBe("2026-09-06");
  });
  it("rejects all authoritative and unknown fields, invalid enums, types and lengths", () => {
    for (const field of [
      "status",
      "ownerUserId",
      "owner_user_id",
      "actorId",
      "version",
      "subjects",
      "expiryDate",
      "lastFollowUp",
      "plans",
      "tasks",
      "id",
    ])
      expect(() => parseStudentCreate({ ...minimal, [field]: "x" })).toThrow();
    for (const extra of [
      { name: " " },
      { name: "𠮷".repeat(65) },
      { grade: "大学一年级" },
      { gender: "未知" },
      { school: "校".repeat(129) },
      { className: "班".repeat(33) },
      { note: "记".repeat(501) },
      { guardianName: "人".repeat(65) },
      { guardianPhone: "00000" },
      { guardianPhone: "000****0000" },
      { guardianPhone: "0".repeat(33) },
      { guardianPhone: "000000\n000" },
      { enrolledAt: "1899-12-31" },
      { enrolledAt: "2026-09-07" },
      { enrolledAt: "2026-02-30" },
      { confirmPossibleDuplicate: "true" },
      { school: 1 },
    ])
      expect(() =>
        parseStudentCreate({ ...minimal, ...extra }, "2026-09-06"),
      ).toThrow();
    for (const field of ["school", "className", "guardianName", "note"]) {
      const max = { school: 128, className: 32, guardianName: 64, note: 500 }[
        field
      ]!;
      expect(() =>
        parseStudentCreate({ ...minimal, [field]: "𠮷".repeat(max) }),
      ).not.toThrow();
    }
    expect(() =>
      parseStudentUpdate({
        ...minimal,
        id: "1",
        expectedVersion: 1,
        status: "在读",
      }),
    ).toThrow();
    for (const version of [0, 4294967296, "1", 1.5])
      expect(() =>
        parseStudentStatus({
          id: "1",
          status: "在读",
          expectedVersion: version,
        }),
      ).toThrow();
    for (const status of ["在读", "待分配", "已结课"])
      expect(
        parseStudentStatus({ id: "1", status, expectedVersion: 1 }).status,
      ).toBe(status);
    expect(() =>
      parseStudentStatus({ id: "1", status: "删除", expectedVersion: 1 }),
    ).toThrow();
  });
  it("masks contact including legacy short formats", () => {
    expect(maskGuardianPhone(null)).toBeNull();
    expect(maskGuardianPhone("00000000000")).toBe("000****0000");
    expect(maskGuardianPhone("+00 (000) 000")).toBe(
      "+0" + "*".repeat(9) + "00",
    );
    expect(maskGuardianPhone("1234")).toBe("*");
  });
  it("accepts only the exact additive migration", () => {
    const sql = readFileSync(
      "database/migrations/007_students_version.sql",
      "utf8",
    );
    expect(parseStudentVersionMigration(sql)).toHaveLength(1);
    for (const bad of [
      sql + " SELECT 1;",
      sql.replace("DEFAULT 1", "DEFAULT 2"),
      sql.replace("students ", "other.students "),
      sql.replace("version > 0", "version >= 0"),
      "ALTER TABLE students DROP COLUMN note;",
    ])
      expect(() => parseStudentVersionMigration(bad)).toThrow();
    expect(() => parseMigration(sql, ["students"], [])).toThrow();
  });
});
function connection(row: object | null) {
  const execute = vi.fn().mockResolvedValue([[...(row ? [row] : [])]]);
  const query = vi
    .fn()
    .mockResolvedValue([[{ current_database: "tutor_workspace" }]]);
  return { db: { execute, query } as unknown as Connection, execute, query };
}
describe("S7 bounded persistence", () => {
  it("checks old version before no-op; rejects overflow, missing and writes only students", async () => {
    const state = connection({ id: "1", status: "在读", version: 2 });
    await expect(
      updateStudent(state.db, { id: "1", status: "在读", expectedVersion: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await updateStudent(state.db, {
      id: "1",
      status: "在读",
      expectedVersion: 2,
    });
    expect(
      state.execute.mock.calls.every(([sql]) => sql.startsWith("SELECT")),
    ).toBe(true);
    state.execute.mockResolvedValueOnce([
      [{ id: "1", status: "在读", version: 4294967295 }],
    ]);
    await expect(
      updateStudent(state.db, {
        id: "1",
        status: "已结课",
        expectedVersion: 4294967295,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      updateStudent(connection(null).db, {
        id: "1",
        status: "在读",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    state.execute
      .mockResolvedValueOnce([[{ id: "1", status: "在读", version: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await updateStudent(state.db, {
      id: "1",
      status: "已结课",
      expectedVersion: 2,
    });
    expect(state.execute.mock.lastCall?.[0]).toMatch(
      /^UPDATE students SET status=/,
    );
    expect(state.execute.mock.lastCall?.[1]).toEqual(["已结课", "1", 2]);
    expect(state.query).toHaveBeenCalledWith(
      "SELECT DATABASE() AS current_database",
    );
  });
  it("duplicate candidates are bounded/projected and confirmation alone allows insert", async () => {
    const state = connection({
      id: "1",
      name: "合成",
      school: "校",
      class_name: "班",
      status: "待分配",
      guardian_phone: "never",
    });
    const input = parseStudentCreate({
      ...minimal,
      school: "校",
      className: "班",
    });
    await expect(createStudent(state.db, input)).rejects.toMatchObject({
      statusCode: 409,
      code: "STUDENT_POSSIBLE_DUPLICATE",
      candidates: [
        {
          id: "1",
          name: "合成",
          school: "校",
          className: "班",
          status: "待分配",
        },
      ],
    });
    expect(state.execute.mock.lastCall?.[0]).toContain("LIMIT 5");
    expect(state.query).not.toHaveBeenCalled();
    state.execute
      .mockResolvedValueOnce([[{ id: "1" }]])
      .mockResolvedValueOnce([{ insertId: "2" }]);
    await createStudent(state.db, { ...input, confirmPossibleDuplicate: true });
    expect(state.execute.mock.lastCall?.[0]).toContain("'待分配',NULL,1");
  });
  it("plaintext prefill is explicit and excludes unrelated fields", async () => {
    const state = connection({
      id: "1",
      guardian_phone: "00000000000",
      version: 1,
      password: "never",
      owner_user_id: "2",
    });
    const view = await findStudentEdit(state.db, "1");
    expect(view.guardianPhone).toBe("00000000000");
    expect(view).not.toHaveProperty("password");
    expect(view).not.toHaveProperty("owner_user_id");
  });
});
