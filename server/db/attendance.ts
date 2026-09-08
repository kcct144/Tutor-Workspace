import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  AttendanceCellWrite,
  AttendanceRecord,
  AttendanceRosterQuery,
  AttendanceRosterResult,
  AttendanceStudent,
  AttendanceTodaySummary,
} from "../../types/api/attendance.ts";
import { attendanceStatuses } from "../../types/api/attendance.ts";
import { ApiError } from "../utils/api.ts";
import { likeValue } from "./contracts.ts";
import { shanghaiToday } from "./contracts-rules.ts";
import { writeAuditLog } from "./audit.ts";
import { attendanceMonthRange } from "./attendance-rules.ts";
import { executeWrite } from "./write.ts";

const maxAttendanceStudents = 200;

interface AttendanceStudentRow extends RowDataPacket {
  id: string;
  name: string;
  grade: AttendanceStudent["grade"];
  gender: AttendanceStudent["gender"];
  status: AttendanceStudent["status"];
}

interface AttendanceRecordRow extends RowDataPacket {
  id: string;
  student_id: string;
  attendance_date: string;
  period: AttendanceRecord["period"];
  status: AttendanceRecord["status"];
  version: number;
  created_at: string;
  updated_at: string;
}

function toIso(value: string): string {
  return value.replace(" ", "T") + "Z";
}

export function projectAttendanceRecord(
  row: AttendanceRecordRow,
): AttendanceRecord {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    attendanceDate: row.attendance_date,
    period: row.period,
    status: row.status,
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function attendanceStudentFilter(query: AttendanceRosterQuery) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (query.keyword) {
    clauses.push("s.name LIKE ? ESCAPE '!'");
    values.push(likeValue(query.keyword));
  }
  if (query.grade) {
    clauses.push("s.grade=?");
    values.push(query.grade);
  }
  if (query.gender) {
    clauses.push("s.gender=?");
    values.push(query.gender);
  }
  if (query.status) {
    clauses.push("s.status=?");
    values.push(query.status);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}

async function attendanceStudents(
  connection: Connection,
  query: AttendanceRosterQuery,
) {
  const filter = attendanceStudentFilter(query);
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM students s" + filter.sql,
    filter.values,
  );
  const total = Number(counts[0]?.total ?? 0);
  if (total > maxAttendanceStudents)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "当前筛选学生超过200人，暂不支持一次加载月度矩阵。",
    );
  const [rows] = await connection.execute<AttendanceStudentRow[]>(
    "SELECT s.id,s.name,s.grade,s.gender,s.status FROM students s" +
      filter.sql +
      " ORDER BY s.name ASC,s.id ASC LIMIT ?",
    [...filter.values, maxAttendanceStudents],
  );
  return {
    total,
    students: rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      grade: row.grade,
      gender: row.gender,
      status: row.status,
    })),
  };
}

export async function listAttendanceMonth(
  connection: Connection,
  query: AttendanceRosterQuery,
): Promise<AttendanceRosterResult> {
  const { students, total } = await attendanceStudents(connection, query);
  if (!students.length)
    return { month: query.month, students, records: [], total };
  const { start, end } = attendanceMonthRange(query.month);
  const ids = students.map((student) => student.id);
  const [rows] = await connection.execute<AttendanceRecordRow[]>(
    "SELECT id,student_id,attendance_date,period,status,version,created_at,updated_at FROM attendance_records WHERE student_id IN (" +
      ids.map(() => "?").join(",") +
      ") AND attendance_date>=? AND attendance_date<? ORDER BY attendance_date,id LIMIT ?",
    [...ids, start, end, maxAttendanceStudents * 31 * 3],
  );
  return {
    month: query.month,
    students,
    records: rows.map(projectAttendanceRecord),
    total,
  };
}

export async function attendanceTodaySummary(
  connection: Connection,
  query: AttendanceRosterQuery,
  selectedPeriod: AttendanceRecord["period"] | "all",
  today = shanghaiToday(),
): Promise<AttendanceTodaySummary> {
  const counts = Object.fromEntries(
    attendanceStatuses.map((status) => [status, 0]),
  ) as AttendanceTodaySummary["counts"];
  if (query.month !== today.slice(0, 7)) return { date: null, counts };
  const filter = attendanceStudentFilter(query);
  const clauses = ["r.attendance_date=?"];
  const values: string[] = [today];
  if (selectedPeriod !== "all") {
    clauses.push("r.period=?");
    values.push(selectedPeriod);
  }
  const where =
    " WHERE " +
    clauses.join(" AND ") +
    (filter.sql ? " AND " + filter.sql.slice(" WHERE ".length) : "");
  const [rows] = await connection.execute<
    Array<RowDataPacket & { status: AttendanceRecord["status"]; total: number }>
  >(
    "SELECT r.status,COUNT(*) AS total FROM attendance_records r JOIN students s ON s.id=r.student_id" +
      where +
      " GROUP BY r.status LIMIT 5",
    [...values, ...filter.values],
  );
  for (const row of rows) counts[row.status] = Number(row.total);
  return { date: today, counts };
}

async function requireAttendanceStudent(
  connection: Connection,
  studentId: string,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id=? LIMIT 1",
    [studentId],
  );
  if (!rows.length) throw new ApiError(404, "NOT_FOUND", "未找到所选学生。");
}

export async function findAttendanceRecord(
  connection: Connection,
  input: Pick<AttendanceCellWrite, "studentId" | "attendanceDate" | "period">,
  locked = false,
): Promise<AttendanceRecord> {
  const [rows] = await connection.execute<AttendanceRecordRow[]>(
    "SELECT id,student_id,attendance_date,period,status,version,created_at,updated_at FROM attendance_records WHERE student_id=? AND attendance_date=? AND period=? LIMIT 1" +
      (locked ? " FOR UPDATE" : ""),
    [input.studentId, input.attendanceDate, input.period],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到出勤记录。");
  return projectAttendanceRecord(rows[0]);
}

function summary(record: AttendanceRecord) {
  return {
    attendanceDate: record.attendanceDate,
    period: record.period,
    status: record.status,
  };
}

function conflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "该时段记录已被其他窗口更新，请保留选择并刷新当月数据后核对。",
  );
}

function duplicate(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

export async function setAttendanceCell(
  connection: Connection,
  input: AttendanceCellWrite,
  actorId: string,
): Promise<AttendanceRecord> {
  await requireAttendanceStudent(connection, input.studentId);
  if (input.expectedVersion === null) {
    try {
      const result = await executeWrite(
        connection,
        "INSERT INTO attendance_records (student_id,attendance_date,period,status,created_by,updated_by) VALUES (?,?,?,?,?,?)",
        [
          input.studentId,
          input.attendanceDate,
          input.period,
          input.status,
          actorId,
          actorId,
        ],
      );
      const created = await findAttendanceRecord(connection, input);
      if (created.id !== String(result.insertId))
        throw new Error("出勤记录回读不一致。");
      await writeAuditLog(connection, {
        actorUserId: actorId,
        action: "attendance_record.create",
        entityType: "attendance_record",
        entityId: created.id,
        studentId: created.studentId,
        after: summary(created),
      });
      return created;
    } catch (error) {
      if (duplicate(error)) conflict();
      throw error;
    }
  }

  let before: AttendanceRecord;
  try {
    // This non-locking read only supplies the audit "before" value. The
    // conditional UPDATE below is the concurrency authority, avoiding a shared
    // read-lock upgrade when two clients submit the same version together.
    before = await findAttendanceRecord(connection, input);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) conflict();
    throw error;
  }
  if (before.version !== input.expectedVersion || before.version >= 4294967295)
    conflict();
  const result = await executeWrite(
    connection,
    "UPDATE attendance_records SET status=?,updated_by=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE student_id=? AND attendance_date=? AND period=? AND version=? AND version<4294967295 AND status<>?",
    [
      input.status,
      actorId,
      input.studentId,
      input.attendanceDate,
      input.period,
      input.expectedVersion,
      input.status,
    ],
  );
  if (!result.affectedRows) {
    let current: AttendanceRecord;
    try {
      // This is a current exclusive read after the atomic update fails. It is
      // not a shared-to-exclusive upgrade and distinguishes an exact no-op from
      // a stale version.
      current = await findAttendanceRecord(connection, input, true);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) conflict();
      throw error;
    }
    if (
      current.version === input.expectedVersion &&
      current.status === input.status
    )
      return current;
    conflict();
  }
  const updated = await findAttendanceRecord(connection, input, true);
  await writeAuditLog(connection, {
    actorUserId: actorId,
    action: "attendance_record.update",
    entityType: "attendance_record",
    entityId: updated.id,
    studentId: updated.studentId,
    before: summary(before),
    after: summary(updated),
  });
  return updated;
}
