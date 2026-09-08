import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAttendanceCellWrite,
  parseAttendanceMonthQuery,
  parseAttendanceSummaryQuery,
} from "../../server/db/attendance-rules";
import {
  attendanceStudentFilter,
  projectAttendanceRecord,
  setAttendanceCell,
} from "../../server/db/attendance";
import {
  parseAttendanceRecordsMigration,
  parseAuditAttendanceRecordMigration,
} from "../../server/db/safety";
import { auditEntityTypes } from "../../server/db/audit";
import { inTransaction } from "../../server/db/pool";
import { ApiError, apiResponse } from "../../server/utils/api";
import type { AttendanceCellWrite } from "../../types/api/attendance";

type StoredAttendance = {
  id: string;
  studentId: string;
  attendanceDate: string;
  period: "morning" | "afternoon" | "evening";
  status: "scheduled" | "present" | "sick_leave" | "personal_leave" | "absent";
  version: number;
  createdAt: string;
  updatedAt: string;
};

class MemoryAttendanceConnection {
  records: StoredAttendance[] = [];
  audits: Array<{ action: string }> = [];
  failAudit = false;
  synchronizeInitialReads = false;
  private nextId = 1;
  private snapshots: Array<{
    records: StoredAttendance[];
    audits: Array<{ action: string }>;
    nextId: number;
  }> = [];
  private initialReadWaiters: Array<() => void> = [];
  private initialReadCount = 0;

  async query(sql: string) {
    if (sql.includes("SELECT DATABASE()"))
      return [[{ current_database: "tutor_workspace" }]];
    return [[]];
  }

  async beginTransaction() {
    this.snapshots.push({
      records: structuredClone(this.records),
      audits: structuredClone(this.audits),
      nextId: this.nextId,
    });
  }

  async commit() {
    this.snapshots.pop();
  }

  async rollback() {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return;
    this.records = snapshot.records;
    this.audits = snapshot.audits;
    this.nextId = snapshot.nextId;
  }

  private row(record: StoredAttendance) {
    return {
      id: record.id,
      student_id: record.studentId,
      attendance_date: record.attendanceDate,
      period: record.period,
      status: record.status,
      version: record.version,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  private async waitForConcurrentInitialRead() {
    if (!this.synchronizeInitialReads) return;
    this.initialReadCount++;
    if (this.initialReadCount === 2) {
      this.synchronizeInitialReads = false;
      for (const resolve of this.initialReadWaiters) resolve();
      this.initialReadWaiters = [];
      return;
    }
    await new Promise<void>((resolve) => this.initialReadWaiters.push(resolve));
  }

  async execute(sql: string, values: readonly unknown[] = []) {
    if (sql.startsWith("SELECT id FROM students")) return [[{ id: "1" }]];

    if (sql.startsWith("SELECT id,student_id,attendance_date")) {
      if (!sql.includes("FOR UPDATE"))
        await this.waitForConcurrentInitialRead();
      const [studentId, attendanceDate, period] = values.map(String);
      const record = this.records.find(
        (entry) =>
          entry.studentId === studentId &&
          entry.attendanceDate === attendanceDate &&
          entry.period === period,
      );
      return [record ? [this.row(record)] : []];
    }

    if (sql.startsWith("INSERT INTO attendance_records")) {
      const [studentId, attendanceDate, period, status] = values.map(String);
      if (
        this.records.some(
          (entry) =>
            entry.studentId === studentId &&
            entry.attendanceDate === attendanceDate &&
            entry.period === period,
        )
      ) {
        const error = Object.assign(new Error("duplicate"), {
          code: "ER_DUP_ENTRY",
        });
        throw error;
      }
      const id = String(this.nextId++);
      this.records.push({
        id,
        studentId,
        attendanceDate,
        period: period as StoredAttendance["period"],
        status: status as StoredAttendance["status"],
        version: 1,
        createdAt: "2026-09-08 00:00:00.000",
        updatedAt: "2026-09-08 00:00:00.000",
      });
      return [{ insertId: Number(id), affectedRows: 1 }];
    }

    if (sql.startsWith("UPDATE attendance_records SET status")) {
      const [status, _actorId, studentId, attendanceDate, period, version] =
        values;
      const record = this.records.find(
        (entry) =>
          entry.studentId === String(studentId) &&
          entry.attendanceDate === String(attendanceDate) &&
          entry.period === String(period),
      );
      if (
        !record ||
        record.version !== Number(version) ||
        record.version >= 4294967295 ||
        record.status === String(status)
      )
        return [{ affectedRows: 0 }];
      record.status = status as StoredAttendance["status"];
      record.version++;
      record.updatedAt = "2026-09-08 00:00:01.000";
      return [{ affectedRows: 1 }];
    }

    if (sql.startsWith("INSERT INTO audit_logs")) {
      if (this.failAudit) throw new Error("audit write failed");
      this.audits.push({ action: String(values[2]) });
      return [{ insertId: this.audits.length, affectedRows: 1 }];
    }
    return [[]];
  }
}

const cell = {
  studentId: "1",
  attendanceDate: "2026-09-08",
  period: "morning" as const,
  status: "present" as const,
  expectedVersion: null,
};

async function writeInMemory(
  connection: MemoryAttendanceConnection,
  input: AttendanceCellWrite,
) {
  return inTransaction(connection as never, () =>
    setAttendanceCell(connection as never, input, "1"),
  );
}

const write = {
  studentId: "1",
  attendanceDate: "2026-09-08",
  period: "morning",
  status: "present",
  expectedVersion: null,
};

describe("S10 attendance validation", () => {
  it("accepts the fixed periods, statuses, and a scheduled future record", () => {
    expect(parseAttendanceCellWrite(write, "2026-09-08")).toEqual(write);
    expect(
      parseAttendanceCellWrite(
        {
          ...write,
          attendanceDate: "2026-09-09",
          period: "evening",
          status: "scheduled",
          expectedVersion: 3,
        },
        "2026-09-08",
      ),
    ).toMatchObject({ period: "evening", status: "scheduled" });
  });

  it("rejects invalid, future, stale-field, and malformed filter input", () => {
    for (const patch of [
      { attendanceDate: "2026-09-09" },
      { attendanceDate: "1899-12-31" },
      { period: "night" },
      { status: "late" },
      { expectedVersion: 0 },
      { actorId: "1" },
      { version: 1 },
    ])
      expect(() =>
        parseAttendanceCellWrite({ ...write, ...patch }, "2026-09-08"),
      ).toThrow();

    expect(parseAttendanceMonthQuery({ month: "2026-09" })).toEqual({
      month: "2026-09",
      keyword: undefined,
      grade: undefined,
      gender: undefined,
      status: undefined,
    });
    expect(
      parseAttendanceSummaryQuery({ month: "2026-09", period: "all" }),
    ).toMatchObject({ month: "2026-09", period: "all" });
    for (const query of [
      { month: "2026-13" },
      { month: "2026-09", grade: "九年级" },
      { month: "2026-09", period: "all" },
      { month: "2026-09", unknown: "x" },
    ])
      expect(() => parseAttendanceMonthQuery(query)).toThrow();
  });

  it("uses parameterized literals and projects only the attendance DTO", () => {
    const filter = attendanceStudentFilter({
      month: "2026-09",
      keyword: "%_'!",
      grade: "初三",
      gender: "女",
      status: "在读",
    });
    expect(filter.sql).toContain("s.name LIKE ? ESCAPE '!'");
    expect(filter.sql).not.toContain("%_'!");
    expect(filter.values).toEqual(["%!%!_'!!%", "初三", "女", "在读"]);
    expect(
      projectAttendanceRecord({
        id: "3",
        student_id: "2",
        attendance_date: "2026-09-08",
        period: "afternoon",
        status: "sick_leave",
        version: 2,
        created_at: "2026-09-08 01:00:00.000",
        updated_at: "2026-09-08 02:00:00.000",
      } as never),
    ).toEqual({
      id: "3",
      studentId: "2",
      attendanceDate: "2026-09-08",
      period: "afternoon",
      status: "sick_leave",
      version: 2,
      createdAt: "2026-09-08T01:00:00.000Z",
      updatedAt: "2026-09-08T02:00:00.000Z",
    });
  });
});

describe("S10 migration and audit boundaries", () => {
  it("accepts only the approved attendance migrations", () => {
    const recordsSql = readFileSync(
      "database/migrations/015_attendance_records.sql",
      "utf8",
    );
    const auditSql = readFileSync(
      "database/migrations/016_audit_attendance_record.sql",
      "utf8",
    );
    expect(parseAttendanceRecordsMigration(recordsSql)).toHaveLength(1);
    expect(parseAuditAttendanceRecordMigration(auditSql)).toHaveLength(1);
    expect(() =>
      parseAttendanceRecordsMigration(recordsSql + " SELECT 1;"),
    ).toThrow();
    expect(() =>
      parseAuditAttendanceRecordMigration(
        auditSql.replace("attendance_record", "other"),
      ),
    ).toThrow();
  });

  it("allows the attendance audit entity without sensitive fields", () => {
    expect(auditEntityTypes).toContain("attendance_record");
    expect(auditEntityTypes).not.toContain("guardianPhone");
  });
});

describe("S10 attendance write concurrency and transaction behavior", () => {
  it("creates one record, rejects a duplicate create, and leaves no duplicate row", async () => {
    const connection = new MemoryAttendanceConnection();
    const created = await writeInMemory(connection, cell);
    expect(created).toMatchObject({ id: "1", version: 1, status: "present" });
    await expect(writeInMemory(connection, cell)).rejects.toMatchObject({
      statusCode: 409,
      code: "VERSION_CONFLICT",
    });
    expect(connection.records).toHaveLength(1);
    expect(connection.audits).toEqual([{ action: "attendance_record.create" }]);
  });

  it("returns 409 for an old version without changing the stored record", async () => {
    const connection = new MemoryAttendanceConnection();
    await writeInMemory(connection, cell);
    await expect(
      writeInMemory(connection, {
        ...cell,
        status: "absent",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
    expect(connection.records[0]).toMatchObject({
      status: "present",
      version: 1,
    });
    expect(connection.audits).toHaveLength(1);
  });

  it("treats an exact-version submission of the current status as a no-op", async () => {
    const connection = new MemoryAttendanceConnection();
    await writeInMemory(connection, cell);
    await expect(
      writeInMemory(connection, { ...cell, expectedVersion: 1 }),
    ).resolves.toMatchObject({ status: "present", version: 1 });
    expect(connection.records[0]).toMatchObject({
      status: "present",
      version: 1,
    });
    expect(connection.audits).toHaveLength(1);
  });

  it("maps two same-version concurrent updates to one success and one 409", async () => {
    const connection = new MemoryAttendanceConnection();
    await writeInMemory(connection, cell);
    connection.synchronizeInitialReads = true;
    const outcomes = await Promise.allSettled([
      setAttendanceCell(
        connection as never,
        { ...cell, status: "absent", expectedVersion: 1 },
        "1",
      ),
      setAttendanceCell(
        connection as never,
        { ...cell, status: "sick_leave", expectedVersion: 1 },
        "1",
      ),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<unknown> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      statusCode: 409,
      code: "VERSION_CONFLICT",
    });
    expect(rejected[0]?.reason).toBeInstanceOf(ApiError);
    expect(connection.records[0]).toMatchObject({ version: 2 });
    expect(connection.audits).toHaveLength(2);
    expect(connection.audits[1]).toEqual({
      action: "attendance_record.update",
    });
  });

  it("rolls back the attendance insert when its audit write fails", async () => {
    const connection = new MemoryAttendanceConnection();
    connection.failAudit = true;
    await expect(writeInMemory(connection, cell)).rejects.toThrow(
      "audit write failed",
    );
    expect(connection.records).toEqual([]);
    expect(connection.audits).toEqual([]);
  });
});

describe("S10 attendance API envelope", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves 409 envelope and no-store for an attendance version conflict", async () => {
    const status = vi.fn();
    const header = vi.fn();
    vi.stubGlobal("setResponseStatus", status);
    vi.stubGlobal("setResponseHeader", header);
    const result = await apiResponse({} as never, async () => {
      throw new ApiError(409, "VERSION_CONFLICT", "记录已被其他窗口更新。");
    });
    expect(result).toEqual({
      status: "error",
      msg: "记录已被其他窗口更新。",
      data: { code: "VERSION_CONFLICT" },
    });
    expect(status).toHaveBeenCalledWith(expect.anything(), 409);
    expect(header).toHaveBeenCalledWith(
      expect.anything(),
      "Cache-Control",
      "no-store",
    );
  });
});
