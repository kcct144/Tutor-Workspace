import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import type { H3Event } from "h3";
import {
  assertApprovedDatabase,
  parseS1Migration,
} from "../../server/db/safety";
import { mysqlOptions } from "../../server/db/config";
import { inTransaction } from "../../server/db/pool";
import {
  parseStudentId,
  parseStudentQuery,
  studentFilter,
} from "../../server/db/student-query";
import { findStudent, listStudents } from "../../server/db/students";
import { apiResponse, ApiError } from "../../server/utils/api";

afterEach(() => vi.unstubAllGlobals());

describe("S1 database boundary", () => {
  it("checks the current connection and rejects wrong or missing databases", async () => {
    for (const database of [null, "not_approved", "tutor_workspace"]) {
      const query = vi
        .fn()
        .mockResolvedValue([[{ current_database: database }]]);
      const check = assertApprovedDatabase({
        query,
      } as unknown as PoolConnection);
      if (database === "tutor_workspace")
        await expect(check).resolves.toBeUndefined();
      else await expect(check).rejects.toThrow("数据库范围校验未通过");
      expect(query).toHaveBeenCalledExactlyOnceWith(
        "SELECT DATABASE() AS current_database",
      );
    }
  });
  it("rejects configuration outside the allowlist before creating a connection", () => {
    expect(() =>
      mysqlOptions({
        database: "",
        host: "",
        port: 3306,
        user: "",
        password: "",
      }),
    ).toThrow();
  });
  it("accepts only the three approved table definitions", () => {
    const sql = ["000_schema_migrations", "001_students"].map((name) =>
      readFileSync(
        new URL(`../../database/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );
    expect(
      sql
        .flatMap(parseS1Migration)
        .map((statement) => statement.match(/^CREATE TABLE (\w+)/)?.[1]),
    ).toEqual(["schema_migrations", "users", "students"]);
    for (const unsafe of [
      "CREATE DATABASE forbidden",
      "USE forbidden",
      "DROP TABLE students",
      "TRUNCATE students",
      "CREATE TABLE contracts (id INT)",
      "CREATE TABLE other.students (id INT)",
      "CREATE TABLE students (id INT); DELETE FROM students",
      "CREATE TABLE students (id INT) /* hidden */",
    ])
      expect(() => parseS1Migration(unsafe)).toThrow();
  });
  it("commits success, rolls back failure, and never begins on a mismatched connection", async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValue([[{ current_database: "tutor_workspace" }]]),
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const db = connection as unknown as PoolConnection;
    await expect(inTransaction(db, async () => 42)).resolves.toBe(42);
    expect(connection.commit).toHaveBeenCalledOnce();
    await expect(
      inTransaction(db, async () => {
        throw new Error("test failure");
      }),
    ).rejects.toThrow("test failure");
    expect(connection.rollback).toHaveBeenCalledOnce();
    connection.beginTransaction.mockClear();
    connection.query.mockResolvedValue([[{ current_database: null }]]);
    const work = vi.fn();
    await expect(inTransaction(db, work)).rejects.toThrow();
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
});

describe("student query and projection", () => {
  it("normalizes pagination and validates enums, arrays, lengths, unknown fields and IDs", () => {
    expect(parseStudentQuery({})).toMatchObject({ page: 1, pageSize: 8 });
    expect(parseStudentQuery({}, true).pageSize).toBe(20);
    expect(
      parseStudentQuery({ pageSize: "100", grade: "初一", status: "在读" })
        .pageSize,
    ).toBe(100);
    for (const query of [
      { page: "0" },
      { page: "1.5" },
      { pageSize: "101" },
      { pageSize: "-1" },
      { keyword: ["a", "b"] },
      { keyword: "a".repeat(65) },
      { grade: "其他" },
      { status: "未知" },
      { actorId: "1" },
    ])
      expect(() => parseStudentQuery(query)).toThrow(ApiError);
    expect(() => parseStudentQuery({ grade: "初一" }, true)).toThrow();
    for (const id of [
      undefined,
      "0",
      "-1",
      "1 OR 1=1",
      "18446744073709551616",
      ["1"],
    ])
      expect(() => parseStudentId({ id })).toThrow();
    expect(parseStudentId({ id: "18446744073709551615" })).toBe(
      "18446744073709551615",
    );
  });
  it("binds filters and escapes literal LIKE metacharacters", () => {
    const filter = studentFilter({
      keyword: "%' OR 1=1_!",
      grade: "初一",
      status: "在读",
    });
    expect(filter.sql).toBe(
      " WHERE s.name LIKE ? ESCAPE '!' AND s.grade = ? AND s.status = ?",
    );
    expect(filter.values).toEqual(["%!%' OR 1=1!_!!%", "初一", "在读"]);
  });
  it("uses bounded server pagination and never spreads sensitive rows", async () => {
    const row = {
      id: "2",
      name: "合成学生",
      grade: "初一",
      class_name: null,
      school: null,
      status: "待分配",
      gender: null,
      enrolled_at: null,
      created_at: "2026-09-06 00:00:00.000",
      guardian_name: null,
      guardian_phone: null,
      note: null,
      owner_id: null,
      owner_name: null,
      password_hash: "must-not-return",
      internal_secret: "must-not-return",
    };
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 9 }]])
      .mockResolvedValueOnce([[row]]);
    const connection = { execute } as unknown as PoolConnection;
    const page = await listStudents(connection, {
      page: 2,
      pageSize: 8,
      grade: "初一",
    });
    expect(page).toMatchObject({ total: 9, page: 2, pageSize: 8 });
    expect(execute.mock.calls[1]?.[0]).toContain("LIMIT ? OFFSET ?");
    expect(execute.mock.calls[1]?.[1]).toEqual(["初一", 8, 8]);
    expect(Object.keys(page.items[0]!)).toEqual([
      "id",
      "name",
      "grade",
      "className",
      "school",
      "status",
      "subjects",
      "plans",
      "expiryDate",
      "lastFollowUp",
    ]);
    execute
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[row]]);
    expect(
      (await listStudents(connection, { page: 1, pageSize: 20 }, true)).items,
    ).toEqual([{ id: "2", name: "合成学生", grade: "初一" }]);
    execute.mockResolvedValueOnce([[row]]);
    const detail = await findStudent(connection, "2");
    expect(detail.owner).toBeNull();
    expect(detail.gender).toBeNull();
    expect(detail).not.toHaveProperty("password_hash");
    expect(detail).not.toHaveProperty("internal_secret");
    execute.mockResolvedValueOnce([[]]);
    await expect(findStudent(connection, "999")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
  it("returns safe, uncached envelopes for errors without driver details", async () => {
    const status = vi.fn();
    const header = vi.fn();
    vi.stubGlobal("setResponseStatus", status);
    vi.stubGlobal("setResponseHeader", header);
    const event = {} as H3Event;
    await expect(
      apiResponse(event, async () => {
        throw new Error("private-driver-detail");
      }),
    ).resolves.toEqual({
      status: "error",
      msg: "数据服务暂不可用，请检查服务配置后重试。",
      data: { code: "STORAGE_UNAVAILABLE" },
    });
    expect(status).toHaveBeenCalledWith(event, 503);
    expect(header).toHaveBeenCalledWith(event, "Cache-Control", "no-store");
    await expect(
      apiResponse(event, async () => {
        throw new ApiError(404, "NOT_FOUND", "未找到学生。");
      }),
    ).resolves.toMatchObject({ status: "error", data: { code: "NOT_FOUND" } });
    await expect(
      apiResponse(event, async () => ({ id: "1" })),
    ).resolves.toEqual({ status: "ok", msg: "成功", data: { id: "1" } });
  });
});
