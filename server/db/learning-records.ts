import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  LearningRecord,
  RecordCreate,
  RecordUpdate,
  RecordQuery,
} from "../../types/api/learning-records.ts";
import type { Page } from "../../types/api/students.ts";
import type { Subject } from "../../types/api/subjects.ts";
import { executeWrite } from "./write.ts";
import { likeValue } from "./contracts.ts";
import { ApiError } from "../utils/api.ts";
interface RecordRow extends RowDataPacket {
  id: string;
  student_id: string;
  author_user_id: string;
  author_name: string;
  category: LearningRecord["category"];
  subject: Subject | null;
  content: string;
  occurred_on: string;
  created_at: string;
  updated_at: string;
  version: number;
}
export function projectRecord(row: RecordRow): LearningRecord {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    author: { id: String(row.author_user_id), name: row.author_name },
    category: row.category,
    subject: row.subject,
    content: row.content,
    occurredOn: row.occurred_on,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    updatedAt: row.updated_at.replace(" ", "T") + "Z",
    version: row.version,
  };
}
const selection =
  "SELECT r.id, r.student_id, r.author_user_id, u.name AS author_name, r.category, r.subject, r.content, r.occurred_on, r.created_at, r.updated_at, r.version FROM student_learning_records r JOIN users u ON u.id=r.author_user_id";
export async function requireRecordStudent(db: Connection, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id=? LIMIT 1",
    [id],
  );
  if (!rows.length)
    throw new ApiError(404, "STUDENT_NOT_FOUND", "未找到学生。");
}
export function recordFilter(query: RecordQuery) {
  const clauses = ["r.student_id = ?"],
    values: (string | number)[] = [query.studentId];
  if (query.category) {
    clauses.push("r.category = ?");
    values.push(query.category);
  }
  if (query.subject) {
    clauses.push("r.subject = ?");
    values.push(query.subject);
  }
  if (query.dateFrom) {
    clauses.push("r.occurred_on >= ?");
    values.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push("r.occurred_on <= ?");
    values.push(query.dateTo);
  }
  if (query.keyword) {
    clauses.push("r.content LIKE ? ESCAPE '!'");
    values.push(likeValue(query.keyword));
  }
  return { sql: " WHERE " + clauses.join(" AND "), values };
}
export async function listRecords(
  db: Connection,
  query: RecordQuery & { page: number; pageSize: number },
): Promise<Page<LearningRecord>> {
  await requireRecordStudent(db, query.studentId);
  const filter = recordFilter(query);
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM student_learning_records r" + filter.sql,
    filter.values,
  );
  const [rows] = await db.execute<RecordRow[]>(
    selection +
      filter.sql +
      " ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?",
    [...filter.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map(projectRecord),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
export async function findRecord(
  db: Connection,
  id: string,
): Promise<LearningRecord> {
  const [rows] = await db.execute<RecordRow[]>(
    selection + " WHERE r.id=? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到学习记录。");
  return projectRecord(rows[0]);
}
export async function createRecord(
  db: Connection,
  input: RecordCreate,
  actorId: string,
) {
  await requireRecordStudent(db, input.studentId);
  const result = await executeWrite(
    db,
    "INSERT INTO student_learning_records (student_id,author_user_id,category,subject,content,occurred_on) VALUES (?,?,?,?,?,?)",
    [
      input.studentId,
      actorId,
      input.category,
      input.subject,
      input.content,
      input.occurredOn,
    ],
  );
  return findRecord(db, String(result.insertId));
}
export async function updateRecord(db: Connection, input: RecordUpdate) {
  const result = await executeWrite(
    db,
    "UPDATE student_learning_records SET category=?,subject=?,content=?,occurred_on=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND version=? AND version<4294967295",
    [
      input.category,
      input.subject,
      input.content,
      input.occurredOn,
      input.id,
      input.expectedVersion,
    ],
  );
  if (!result.affectedRows) {
    await findRecord(db, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "记录已被修改，请保留草稿并重新载入最新版本。",
    );
  }
  return findRecord(db, input.id);
}
