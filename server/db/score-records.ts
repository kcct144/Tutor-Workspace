import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  ScoreRecord,
  ScoreRecordCreate,
  ScoreRecordQuery,
  ScoreRecordUpdate,
} from "../../types/api/score-records.ts";
import type { Page } from "../../types/api/students.ts";
import { ApiError } from "../utils/api.ts";
import { likeValue } from "./contracts.ts";
import { writeAuditLog } from "./audit.ts";
import { executeWrite } from "./write.ts";

interface ScoreRecordRow extends RowDataPacket {
  id: string;
  student_id: string;
  student_name: string;
  exam_date: string;
  subject: string;
  record_type: ScoreRecord["type"];
  exam_name: string;
  score: string;
  full_score: string;
  score_rate: string;
  created_at: string;
  updated_at: string;
  version: number;
}

const selection =
  "SELECT r.id,r.student_id,s.name AS student_name,r.exam_date,r.subject,r.record_type,r.exam_name,r.score,r.full_score,CAST(ROUND((r.score / r.full_score) * 100,2) AS CHAR) AS score_rate,r.created_at,r.updated_at,r.version FROM score_records r JOIN students s ON s.id=r.student_id";

function toIso(value: string): string {
  return value.replace(" ", "T") + "Z";
}

export function projectScoreRecord(row: ScoreRecordRow): ScoreRecord {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    studentName: row.student_name,
    examDate: row.exam_date,
    subject: row.subject,
    type: row.record_type,
    examName: row.exam_name,
    score: String(row.score),
    fullScore: String(row.full_score),
    scoreRate: String(row.score_rate),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
  };
}

export async function requireScoreStudent(
  connection: Connection,
  studentId: string,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id=? LIMIT 1",
    [studentId],
  );
  if (!rows.length) throw new ApiError(404, "NOT_FOUND", "未找到所选学生。");
}

export function scoreRecordFilter(query: ScoreRecordQuery) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (query.keyword) {
    clauses.push("(s.name LIKE ? ESCAPE '!' OR r.exam_name LIKE ? ESCAPE '!')");
    values.push(likeValue(query.keyword), likeValue(query.keyword));
  }
  if (query.studentId) {
    clauses.push("r.student_id=?");
    values.push(query.studentId);
  }
  if (query.subject) {
    clauses.push("r.subject=?");
    values.push(query.subject);
  }
  if (query.type) {
    clauses.push("r.record_type=?");
    values.push(query.type);
  }
  if (query.dateFrom) {
    clauses.push("r.exam_date>=?");
    values.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push("r.exam_date<=?");
    values.push(query.dateTo);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}

export async function listScoreRecords(
  connection: Connection,
  query: ScoreRecordQuery & { page: number; pageSize: number },
): Promise<Page<ScoreRecord>> {
  const filter = scoreRecordFilter(query);
  const from = " FROM score_records r JOIN students s ON s.id=r.student_id";
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total" + from + filter.sql,
    filter.values,
  );
  const [rows] = await connection.execute<ScoreRecordRow[]>(
    selection +
      filter.sql +
      " ORDER BY r.exam_date DESC,r.id DESC LIMIT ? OFFSET ?",
    [...filter.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map(projectScoreRecord),
    total: Number(counts[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function findScoreRecord(
  connection: Connection,
  id: string,
  locked = false,
): Promise<ScoreRecord> {
  const [rows] = await connection.execute<ScoreRecordRow[]>(
    selection + " WHERE r.id=? LIMIT 1" + (locked ? " FOR SHARE" : ""),
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到成绩记录。");
  return projectScoreRecord(rows[0]);
}

export async function scoreRecordSubjects(
  connection: Connection,
  query: { page: number; pageSize: number; keyword?: string },
): Promise<Page<{ value: string }>> {
  const where = query.keyword ? " WHERE subject LIKE ? ESCAPE '!'" : "";
  const values = query.keyword ? [likeValue(query.keyword)] : [];
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT subject) AS total FROM score_records" + where,
    values,
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT DISTINCT subject AS value FROM score_records" +
      where +
      " ORDER BY value LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({ value: String(row.value) })),
    total: Number(counts[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

function auditSummary(record: ScoreRecord) {
  return {
    studentId: record.studentId,
    examDate: record.examDate,
    subject: record.subject,
    type: record.type,
    examName: record.examName,
    score: record.score,
    fullScore: record.fullScore,
  };
}

export async function createScoreRecord(
  connection: Connection,
  input: ScoreRecordCreate,
  actorId: string,
): Promise<ScoreRecord> {
  await requireScoreStudent(connection, input.studentId);
  const result = await executeWrite(
    connection,
    "INSERT INTO score_records (student_id,exam_date,subject,record_type,exam_name,score,full_score,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      input.studentId,
      input.examDate,
      input.subject,
      input.type,
      input.examName,
      input.score,
      input.fullScore,
      actorId,
      actorId,
    ],
  );
  const record = await findScoreRecord(connection, String(result.insertId));
  await writeAuditLog(connection, {
    actorUserId: actorId,
    action: "score_record.create",
    entityType: "score_record",
    entityId: record.id,
    studentId: record.studentId,
    after: auditSummary(record),
  });
  return record;
}

export async function updateScoreRecord(
  connection: Connection,
  input: ScoreRecordUpdate,
  actorId: string,
): Promise<ScoreRecord> {
  const before = await findScoreRecord(connection, input.id, true);
  if (before.version !== input.expectedVersion || before.version >= 4294967295)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "成绩记录已被修改，请保留草稿并重新载入最新版本。",
    );
  await requireScoreStudent(connection, input.studentId);
  const result = await executeWrite(
    connection,
    "UPDATE score_records SET student_id=?,exam_date=?,subject=?,record_type=?,exam_name=?,score=?,full_score=?,updated_by=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND version=? AND version<4294967295",
    [
      input.studentId,
      input.examDate,
      input.subject,
      input.type,
      input.examName,
      input.score,
      input.fullScore,
      actorId,
      input.id,
      input.expectedVersion,
    ],
  );
  if (!result.affectedRows) {
    await findScoreRecord(connection, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "成绩记录已被修改，请保留草稿并重新载入最新版本。",
    );
  }
  const record = await findScoreRecord(connection, input.id);
  await writeAuditLog(connection, {
    actorUserId: actorId,
    action: "score_record.update",
    entityType: "score_record",
    entityId: record.id,
    studentId: record.studentId,
    before: auditSummary(before),
    after: auditSummary(record),
  });
  return record;
}
