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
import { taskAssignmentCounts } from "./task-assignments.ts";
import { writeAuditLog } from "./audit.ts";

interface TaskRow extends RowDataPacket {
  id: string;
  title: string;
  subject: string;
  description: string;
  status: TaskDefinition["status"];
  version: number;
  created_at: string;
  updated_at: string;
  study_plan_id: string | null;
  study_plan_title: string | null;
}

const fields =
  "t.id,t.title,t.subject,t.description,t.status,t.version,t.created_at,t.updated_at,t.study_plan_id,p.title AS study_plan_title";
const joins =
  " FROM tasks t LEFT JOIN study_plan_documents p ON p.id=t.study_plan_id";

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
    studyPlan: row.study_plan_id
      ? { id: String(row.study_plan_id), title: row.study_plan_title ?? "" }
      : null,
  };
}

function filter(query: TaskQuery, options = false) {
  const clauses: string[] = [],
    values: string[] = [];
  if (query.keyword) {
    clauses.push(
      "(t.title LIKE ? ESCAPE '!' OR t.subject LIKE ? ESCAPE '!' OR t.description LIKE ? ESCAPE '!')",
    );
    values.push(...Array<string>(3).fill(likeValue(query.keyword)));
  }
  if (query.subject) {
    clauses.push("t.subject=?");
    values.push(query.subject);
  }
  if (options || query.status) {
    clauses.push("t.status=?");
    values.push(options ? "enabled" : query.status!);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}

async function requirePlan(
  db: Connection,
  studyPlanId: string | null | undefined,
) {
  if (!studyPlanId) return;
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM study_plan_documents WHERE id=? LIMIT 1 FOR SHARE",
    [studyPlanId],
  );
  if (!rows.length)
    throw new ApiError(404, "NOT_FOUND", "未找到关联的学习计划。");
}

function auditSummary(task: TaskDefinition) {
  return {
    title: task.title,
    subject: task.subject,
    status: task.status,
    studyPlanId: task.studyPlan?.id ?? null,
  };
}

export async function listTasks(
  db: Connection,
  query: TaskQuery & { page: number; pageSize: number },
  options = false,
): Promise<Page<TaskDefinition | TaskOption>> {
  const where = filter(query, options);
  const [count] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM tasks t" + where.sql + " LIMIT 1",
    where.values,
  );
  const [rows] = await db.execute<TaskRow[]>(
    "SELECT " +
      (options
        ? "t.id,t.title,t.subject,t.study_plan_id,p.title AS study_plan_title"
        : fields) +
      joins +
      where.sql +
      " ORDER BY t.updated_at DESC,t.id DESC LIMIT ? OFFSET ?",
    [...where.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const counts = options
    ? new Map<string, number>()
    : await taskAssignmentCounts(
        db,
        rows.map((row) => String(row.id)),
      );
  return {
    items: options
      ? rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          subject: row.subject,
          studyPlan: row.study_plan_id
            ? {
                id: String(row.study_plan_id),
                title: row.study_plan_title ?? "",
              }
            : null,
        }))
      : rows.map((row) => ({
          ...projectTask(row),
          assignmentCount: counts.get(String(row.id)) ?? 0,
        })),
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
    "SELECT " + fields + joins + " WHERE t.id=? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到任务定义。");
  const counts = await taskAssignmentCounts(db, [id]);
  return { ...projectTask(rows[0]), assignmentCount: counts.get(id) ?? 0 };
}

export async function createTask(
  db: Connection,
  input: TaskWrite,
  actor: string,
) {
  await requirePlan(db, input.studyPlanId);
  const result = await executeWrite(
    db,
    "INSERT INTO tasks (owner_user_id,study_plan_id,title,subject,description) VALUES (?,?,?,?,?)",
    [
      actor,
      input.studyPlanId ?? null,
      input.title,
      input.subject,
      input.description,
    ],
  );
  const task = await findTask(db, String(result.insertId));
  await writeAuditLog(db, {
    actorUserId: actor,
    action: "task.create",
    entityType: "task",
    entityId: task.id,
    after: auditSummary(task),
  });
  return task;
}

export async function updateTask(
  db: Connection,
  input: TaskUpdate | TaskStatusWrite,
  actor: string,
) {
  const full = "title" in input;
  const before = await findTask(db, input.id);
  if (full) await requirePlan(db, input.studyPlanId);
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (full) {
    sets.push("title=?", "subject=?", "description=?");
    values.push(input.title, input.subject, input.description);
    if (input.studyPlanId !== undefined) {
      sets.push("study_plan_id=?");
      values.push(input.studyPlanId);
    }
  }
  sets.push(
    "status=?",
    "owner_user_id=?",
    "updated_at=UTC_TIMESTAMP(3)",
    "version=version+1",
  );
  values.push(input.status, actor, input.id, String(input.expectedVersion));
  const result = await executeWrite(
    db,
    "UPDATE tasks SET " +
      sets.join(",") +
      " WHERE id=? AND version=? AND version<4294967295",
    values,
  );
  if (!result.affectedRows) {
    await findTask(db, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "任务已被修改；编辑内容已保留，请核对最新版本后重试。",
    );
  }
  const task = await findTask(db, input.id);
  await writeAuditLog(db, {
    actorUserId: actor,
    action: full ? "task.update" : "task.status",
    entityType: "task",
    entityId: task.id,
    before: auditSummary(before),
    after: auditSummary(task),
  });
  return task;
}
