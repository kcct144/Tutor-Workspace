import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Page } from "../../types/api/students.ts";
import type {
  TaskAssignment,
  AssignmentQuery,
  AssignmentBatch,
  AssignmentCompletion,
} from "../../types/api/task-assignments.ts";
import { ApiError } from "../utils/api.ts";
import { executeWrite } from "./write.ts";
import { writeAuditLog } from "./audit.ts";
import { likeValue } from "./contracts.ts";
import { shanghaiToday } from "./contracts-rules.ts";
import { assignmentDueState } from "./assignment-rules.ts";
interface AssignmentRow extends RowDataPacket {
  id: string;
  task_id: string;
  student_id: string;
  task_title: string;
  description: string;
  subject: string;
  student_name: string;
  status: TaskAssignment["status"];
  assigned_at: string;
  due_date: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  study_plan_id_snapshot: string | null;
  study_plan_title: string | null;
  group_count?: number;
}
const columns =
  "a.id,a.task_id,a.student_id,a.study_plan_id_snapshot,t.title AS task_title,t.description,t.subject,s.name AS student_name,p.title AS study_plan_title,a.status,a.assigned_at,a.due_date,a.completed_at,a.created_at,a.updated_at,a.version";
const joins =
  " FROM task_assignments a JOIN tasks t ON t.id=a.task_id JOIN students s ON s.id=a.student_id LEFT JOIN study_plan_documents p ON p.id=a.study_plan_id_snapshot";
const time = (value: string) => value.replace(" ", "T") + "Z";
export function projectAssignment(
  row: AssignmentRow,
  today: string,
): TaskAssignment {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    studentId: String(row.student_id),
    taskTitle: row.task_title,
    description: row.description,
    subject: row.subject,
    studentName: row.student_name,
    status: row.status,
    assignedAt: time(row.assigned_at),
    dueDate: row.due_date,
    completedAt: row.completed_at ? time(row.completed_at) : null,
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
    version: row.version,
    planSnapshot: row.study_plan_id_snapshot
      ? {
          id: String(row.study_plan_id_snapshot),
          title: row.study_plan_title ?? "",
        }
      : null,
    dueState: assignmentDueState(row.status, row.due_date, today),
  };
}
export const assignmentOrder =
  "a.status='pending' DESC,CASE WHEN a.status='pending' THEN a.due_date END ASC,CASE WHEN a.status='pending' THEN a.id END ASC,CASE WHEN a.status='completed' THEN a.completed_at END DESC,a.id DESC";
export async function findAssignment(
  db: Connection,
  id: string,
  today = shanghaiToday(),
  locking = false,
) {
  const [rows] = await db.execute<AssignmentRow[]>(
    "SELECT " +
      columns +
      joins +
      " WHERE a.id=? LIMIT 1" +
      (locking ? " FOR UPDATE OF a" : ""),
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到任务分配。");
  return projectAssignment(rows[0], today);
}
function filter(query: AssignmentQuery, today: string) {
  const clauses: string[] = [],
    values: string[] = [];
  if (query.keyword) {
    clauses.push("(t.title LIKE ? ESCAPE '!' OR s.name LIKE ? ESCAPE '!')");
    values.push(likeValue(query.keyword), likeValue(query.keyword));
  }
  for (const [key, column] of [
    ["taskId", "a.task_id"],
    ["studentId", "a.student_id"],
    ["subject", "t.subject"],
    ["status", "a.status"],
  ] as const) {
    if (query[key]) {
      clauses.push(column + "=?");
      values.push(query[key]!);
    }
  }
  if (query.dueState) {
    clauses.push(
      "a.status='pending'",
      "a.due_date" +
        { overdue: "<", today: "=", upcoming: ">" }[query.dueState] +
        "?",
    );
    values.push(today);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}
export async function listAssignments(
  db: Connection,
  query: AssignmentQuery & { page: number; pageSize: number },
  today = shanghaiToday(),
): Promise<Page<TaskAssignment>> {
  for (const [id, table] of [
    [query.studentId, "students"],
    [query.taskId, "tasks"],
  ] as const) {
    if (id) {
      const [rows] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM " + table + " WHERE id=? LIMIT 1",
        [id],
      );
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "未找到筛选的学生或任务。");
    }
  }
  const where = filter(query, today);
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total" + joins + where.sql + " LIMIT 1",
    where.values,
  );
  const [rows] = await db.execute<AssignmentRow[]>(
    "SELECT " +
      columns +
      joins +
      where.sql +
      " ORDER BY " +
      assignmentOrder +
      " LIMIT ? OFFSET ?",
    [...where.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => projectAssignment(row, today)),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
function conflict(message: string): never {
  throw new ApiError(409, "ASSIGNMENT_CONFLICT", message);
}
function planNotLinked(): never {
  throw new ApiError(
    409,
    "STUDENT_PLAN_NOT_LINKED",
    "所选学生未关联该学习计划，请调整学生或先建立计划关联。",
  );
}
function duplicate(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}
export async function createAssignmentBatch(
  db: Connection,
  input: AssignmentBatch,
  actor: string,
) {
  const [tasks] = await db.execute<RowDataPacket[]>(
    "SELECT t.id,t.status,t.study_plan_id,p.title AS study_plan_title FROM tasks t LEFT JOIN study_plan_documents p ON p.id=t.study_plan_id WHERE t.id=? LIMIT 1 FOR UPDATE",
    [input.taskId],
  );
  if (!tasks[0]) throw new ApiError(404, "NOT_FOUND", "未找到任务定义。");
  if (tasks[0].status !== "enabled") conflict("停用任务不能创建分配。");
  const slots = input.studentIds.map(() => "?").join(",");
  const [students] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id IN (" +
      slots +
      ") ORDER BY id LIMIT ? FOR SHARE",
    [...input.studentIds, input.studentIds.length],
  );
  if (students.length !== input.studentIds.length)
    throw new ApiError(404, "NOT_FOUND", "存在未找到的学生，整批未创建。");
  const studyPlanId = tasks[0].study_plan_id as string | null;
  if (studyPlanId) {
    const [linked] = await db.execute<RowDataPacket[]>(
      "SELECT student_id FROM study_plan_students WHERE plan_id=? AND student_id IN (" +
        slots +
        ") ORDER BY student_id LIMIT ? FOR SHARE",
      [studyPlanId, ...input.studentIds, input.studentIds.length],
    );
    if (linked.length !== input.studentIds.length) planNotLinked();
  }
  const [pending] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM task_assignments WHERE task_id=? AND student_id IN (" +
      slots +
      ") AND pending_marker=1 LIMIT ? FOR UPDATE",
    [input.taskId, ...input.studentIds, input.studentIds.length],
  );
  if (pending.length)
    conflict("所选学生存在同一任务的待完成分配，整批未创建。");
  try {
    await executeWrite(
      db,
      "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,due_date) VALUES " +
        input.studentIds.map(() => "(?,?,?,?,?)").join(","),
      input.studentIds.flatMap((id) => [
        input.taskId,
        id,
        studyPlanId,
        actor,
        input.dueDate,
      ]),
    );
  } catch (error) {
    if (duplicate(error)) conflict("待完成分配冲突，整批未创建。");
    throw error;
  }
  const [created] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM task_assignments WHERE task_id=? AND student_id IN (" +
      slots +
      ") AND pending_marker=1 ORDER BY id LIMIT ? FOR UPDATE",
    [input.taskId, ...input.studentIds, input.studentIds.length],
  );
  if (created.length !== input.studentIds.length)
    throw new Error("任务分配回读不完整。");
  const [auditRows] = await db.execute<RowDataPacket[]>(
    "SELECT id,student_id,status,due_date,study_plan_id_snapshot FROM task_assignments WHERE id IN (" +
      created.map(() => "?").join(",") +
      ") ORDER BY id LIMIT ?",
    [...created.map((row) => String(row.id)), created.length],
  );
  for (const row of auditRows) {
    await writeAuditLog(db, {
      actorUserId: actor,
      action: "task_assignment.create",
      entityType: "task_assignment",
      entityId: String(row.id),
      studentId: String(row.student_id),
      after: {
        taskId: input.taskId,
        dueDate: String(row.due_date),
        status: String(row.status),
        studyPlanId: row.study_plan_id_snapshot
          ? String(row.study_plan_id_snapshot)
          : null,
      },
    });
  }
  return {
    assignmentIds: created.map((row) => String(row.id)),
    createdCount: created.length,
    planSnapshot: studyPlanId
      ? { id: studyPlanId, title: String(tasks[0].study_plan_title ?? "") }
      : null,
  };
}
export async function completeAssignment(
  db: Connection,
  input: AssignmentCompletion,
  actor: string,
  today = shanghaiToday(),
) {
  const status = input.completed ? "completed" : "pending";
  let changed: boolean;
  try {
    const result = await executeWrite(
      db,
      "UPDATE task_assignments SET status=?,completed_at=" +
        (input.completed ? "UTC_TIMESTAMP(3)" : "NULL") +
        ",updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=? AND version=? AND status<>? AND version<4294967295",
      [status, input.id, input.expectedVersion, status],
    );
    changed = result.affectedRows === 1;
  } catch (error) {
    if (duplicate(error))
      conflict("已有同一学生和任务的待完成分配，无法恢复；原完成状态保留。");
    throw error;
  }
  const current = await findAssignment(db, input.id, today, true);
  if (current.version === input.expectedVersion && current.status === status)
    return current;
  if (
    changed &&
    current.version === input.expectedVersion + 1 &&
    current.status === status
  ) {
    await writeAuditLog(db, {
      actorUserId: actor,
      action: "task_assignment.completion",
      entityType: "task_assignment",
      entityId: current.id,
      studentId: current.studentId,
      before: { status: input.completed ? "pending" : "completed" },
      after: { status: current.status },
    });
    return current;
  }
  conflict("任务分配版本已变化，请刷新后重试。");
}
export async function taskAssignmentCounts(db: Connection, ids: string[]) {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT task_id,COUNT(DISTINCT student_id) AS count FROM task_assignments WHERE task_id IN (" +
      ids.map(() => "?").join(",") +
      ") GROUP BY task_id LIMIT ?",
    [...ids, ids.length],
  );
  for (const row of rows) counts.set(String(row.task_id), Number(row.count));
  return counts;
}
