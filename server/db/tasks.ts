import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  TaskDefinition,
  TaskQuery,
  TaskWrite,
  TaskUpdate,
  TaskStatusWrite,
  TaskOption,
} from "../../types/api/tasks.ts";
import type { Page } from "../../types/api/students.ts";
import { likeValue } from "./contracts.ts";
import { executeWrite } from "./write.ts";
import { ApiError } from "../utils/api.ts";
interface TaskRow extends RowDataPacket {
  id: string;
  title: string;
  subject: string;
  description: string;
  status: TaskDefinition["status"];
  version: number;
  created_at: string;
  updated_at: string;
}
const fields =
  "id,title,subject,description,status,version,created_at,updated_at";
export function projectTask(row: TaskRow): TaskDefinition {
  return {
    id: String(row.id),
    title: row.title,
    subject: row.subject,
    description: row.description,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    updatedAt: row.updated_at.replace(" ", "T") + "Z",
    assignmentCount: 0,
  };
}
function filter(query: TaskQuery, options = false) {
  const clauses: string[] = [],
    values: string[] = [];
  if (query.keyword) {
    clauses.push(
      "(title LIKE ? ESCAPE '!' OR subject LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')",
    );
    values.push(...Array<string>(3).fill(likeValue(query.keyword)));
  }
  if (query.subject) {
    clauses.push("subject=?");
    values.push(query.subject);
  }
  if (options || query.status) {
    clauses.push("status=?");
    values.push(options ? "enabled" : query.status!);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}
export async function listTasks(
  db: Connection,
  query: TaskQuery & { page: number; pageSize: number },
  options = false,
): Promise<Page<TaskDefinition | TaskOption>> {
  const where = filter(query, options);
  const [count] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM tasks" + where.sql + " LIMIT 1",
    where.values,
  );
  const [rows] = await db.execute<TaskRow[]>(
    "SELECT " +
      (options ? "id,title,subject" : fields) +
      " FROM tasks" +
      where.sql +
      " ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?",
    [...where.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: options
      ? rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          subject: row.subject,
        }))
      : rows.map(projectTask),
    total: Number(count[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
export async function taskSubjects(
  db: Connection,
  query: TaskQuery & { page: number; pageSize: number },
): Promise<Page<{ value: string }>> {
  const where = query.keyword ? " WHERE subject LIKE ? ESCAPE '!'" : "";
  const values = query.keyword ? [likeValue(query.keyword)] : [];
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT subject) AS total FROM tasks" + where + " LIMIT 1",
    values,
  );
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT DISTINCT subject AS value FROM tasks" +
      where +
      " ORDER BY value LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({ value: String(row.value) })),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
export async function findTask(
  db: Connection,
  id: string,
): Promise<TaskDefinition> {
  const [rows] = await db.execute<TaskRow[]>(
    "SELECT " + fields + " FROM tasks WHERE id=? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到任务定义。");
  return projectTask(rows[0]);
}
export async function createTask(
  db: Connection,
  input: TaskWrite,
  actor: string,
) {
  const result = await executeWrite(
    db,
    "INSERT INTO tasks (owner_user_id,title,subject,description) VALUES (?,?,?,?)",
    [actor, input.title, input.subject, input.description],
  );
  return findTask(db, String(result.insertId));
}
export async function updateTask(
  db: Connection,
  input: TaskUpdate | TaskStatusWrite,
  actor: string,
) {
  const full = "title" in input;
  const result = await executeWrite(
    db,
    "UPDATE tasks SET " +
      (full ? "title=?,subject=?,description=?," : "") +
      "status=?,owner_user_id=?,updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=? AND version=? AND version<4294967295",
    [
      ...(full ? [input.title, input.subject, input.description] : []),
      input.status,
      actor,
      input.id,
      input.expectedVersion,
    ],
  );
  if (!result.affectedRows) {
    await findTask(db, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "任务已被修改；编辑内容已保留，请核对最新版本后重试。",
    );
  }
  return findTask(db, input.id);
}
