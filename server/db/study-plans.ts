import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Page } from "../../types/api/students.ts";
import type {
  PlanTag,
  PlanDetail,
  PlanListItem,
  PlanQuery,
  PlanUpdate,
  PlanStudentProgress,
  PlanTaskProgress,
} from "../../types/api/study-plans.ts";
import type { TaskDefinition } from "../../types/api/tasks.ts";
import { likeValue } from "./contracts.ts";
import { executeWrite } from "./write.ts";
import { ApiError } from "../utils/api.ts";
import { taskAssignmentCounts } from "./task-assignments.ts";

interface PlanRow extends RowDataPacket {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  version: number;
  updated_at: string;
  created_at: string;
  owner_user_id: string;
  owner_name: string;
}

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

interface ProgressRow extends RowDataPacket {
  student_id: string;
  student_name: string;
  grade: string | null;
  completed_assignments: number;
  total_assignments: number;
}

export function projectPlanList(row: PlanRow): PlanListItem {
  return {
    id: String(row.id),
    title: row.title,
    summary: row.summary,
    updatedAt: row.updated_at.replace(" ", "T") + "Z",
    version: row.version,
  };
}

export function projectPlanDetail(row: PlanRow): PlanDetail {
  return {
    ...projectPlanList(row),
    content: row.content,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    owner: { id: String(row.owner_user_id), name: row.owner_name },
    relatedTasks: [],
    studentProgress: [],
  };
}

export async function listPlans(
  db: Connection,
  query: PlanQuery & { page: number; pageSize: number },
): Promise<Page<PlanListItem>> {
  const where = query.keyword
    ? " WHERE (title LIKE ? ESCAPE '!' OR summary LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!')"
    : "";
  const values = query.keyword
    ? Array<string>(3).fill(likeValue(query.keyword))
    : [];
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM study_plan_documents" + where + " LIMIT 1",
    values,
  );
  const [rows] = await db.execute<PlanRow[]>(
    "SELECT id,title,summary,updated_at,version FROM study_plan_documents" +
      where +
      " ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map(projectPlanList),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listPlanOptions(
  db: Connection,
  query: PlanQuery & { page: number; pageSize: number },
): Promise<Page<PlanTag>> {
  const where = query.keyword
    ? " WHERE title LIKE ? ESCAPE '!' OR summary LIKE ? ESCAPE '!'"
    : "";
  const values = query.keyword
    ? [likeValue(query.keyword), likeValue(query.keyword)]
    : [];
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM study_plan_documents" + where + " LIMIT 1",
    values,
  );
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id,title FROM study_plan_documents" +
      where +
      " ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
    })),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}

function progress(
  plan: PlanTag,
  completedAssignments: number,
  totalAssignments: number,
): PlanTaskProgress {
  return {
    plan,
    completedAssignments,
    totalAssignments,
    progressPercent: totalAssignments
      ? Math.round((completedAssignments / totalAssignments) * 100)
      : null,
    progressState: totalAssignments ? "active" : "empty",
  };
}

async function planStudentProgress(
  db: Connection,
  plan: PlanTag,
): Promise<PlanStudentProgress[]> {
  const [rows] = await db.execute<ProgressRow[]>(
    "SELECT ps.student_id,s.name AS student_name,s.grade,COALESCE(a.completed_assignments,0) AS completed_assignments,COALESCE(a.total_assignments,0) AS total_assignments FROM study_plan_students ps JOIN students s ON s.id=ps.student_id LEFT JOIN (SELECT student_id,SUM(status='completed') AS completed_assignments,COUNT(*) AS total_assignments FROM task_assignments WHERE study_plan_id_snapshot=? GROUP BY student_id) a ON a.student_id=ps.student_id WHERE ps.plan_id=? ORDER BY s.name,s.id LIMIT 100",
    [plan.id, plan.id],
  );
  return rows.map((row) => ({
    student: {
      id: String(row.student_id),
      name: row.student_name,
      grade: row.grade,
    },
    ...progress(
      plan,
      Number(row.completed_assignments),
      Number(row.total_assignments),
    ),
  }));
}

async function relatedPlanTasks(
  db: Connection,
  plan: PlanTag,
): Promise<TaskDefinition[]> {
  const [rows] = await db.execute<TaskRow[]>(
    "SELECT id,title,subject,description,status,version,created_at,updated_at FROM tasks WHERE study_plan_id=? ORDER BY updated_at DESC,id DESC LIMIT 100",
    [plan.id],
  );
  const counts = await taskAssignmentCounts(
    db,
    rows.map((row) => String(row.id)),
  );
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    subject: row.subject,
    description: row.description,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    updatedAt: row.updated_at.replace(" ", "T") + "Z",
    assignmentCount: counts.get(String(row.id)) ?? 0,
    studyPlan: plan,
  }));
}

export async function findPlan(
  db: Connection,
  id: string,
): Promise<PlanDetail> {
  const [rows] = await db.execute<PlanRow[]>(
    "SELECT p.id,p.title,p.summary,p.content,p.version,p.created_at,p.updated_at,p.owner_user_id,u.name AS owner_name FROM study_plan_documents p JOIN users u ON u.id=p.owner_user_id WHERE p.id=? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到学习计划。");
  const plan = projectPlanDetail(rows[0]);
  const tag: PlanTag = { id: plan.id, title: plan.title };
  const relatedTasks = await relatedPlanTasks(db, tag);
  const studentProgress = await planStudentProgress(db, tag);
  return { ...plan, relatedTasks, studentProgress };
}

export async function updatePlan(db: Connection, input: PlanUpdate) {
  const result = await executeWrite(
    db,
    "UPDATE study_plan_documents SET content=?,updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=? AND version=? AND version<4294967295",
    [input.content, input.id, input.expectedVersion],
  );
  if (!result.affectedRows) {
    await findPlan(db, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "计划已被修改，草稿已保留，请重载最新版本后再编辑。",
    );
  }
  return findPlan(db, input.id);
}

export async function studentPlanProgress(
  db: Connection,
  studentId: string,
): Promise<PlanTaskProgress[]> {
  const [students] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id=? LIMIT 1",
    [studentId],
  );
  if (!students.length) throw new ApiError(404, "NOT_FOUND", "未找到学生。");
  const [rows] = await db.execute<
    Array<
      RowDataPacket & {
        plan_id: string;
        title: string;
        completed_assignments: number;
        total_assignments: number;
      }
    >
  >(
    "SELECT ps.plan_id,p.title,COALESCE(a.completed_assignments,0) AS completed_assignments,COALESCE(a.total_assignments,0) AS total_assignments FROM study_plan_students ps JOIN study_plan_documents p ON p.id=ps.plan_id LEFT JOIN (SELECT study_plan_id_snapshot,SUM(status='completed') AS completed_assignments,COUNT(*) AS total_assignments FROM task_assignments WHERE student_id=? AND study_plan_id_snapshot IS NOT NULL GROUP BY study_plan_id_snapshot) a ON a.study_plan_id_snapshot=ps.plan_id WHERE ps.student_id=? ORDER BY p.id LIMIT 100",
    [studentId, studentId],
  );
  return rows.map((row) =>
    progress(
      { id: String(row.plan_id), title: row.title },
      Number(row.completed_assignments),
      Number(row.total_assignments),
    ),
  );
}

export async function studentPlanTags(db: Connection, ids: string[]) {
  const result = new Map<string, PlanTag[]>();
  if (!ids.length) return result;
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT ps.student_id,JSON_ARRAYAGG(JSON_OBJECT('id',CAST(p.id AS CHAR),'title',p.title)) AS plans FROM study_plan_students ps JOIN study_plan_documents p ON p.id=ps.plan_id WHERE ps.student_id IN (" +
      ids.map(() => "?").join(",") +
      ") GROUP BY ps.student_id LIMIT ?",
    [...ids, ids.length],
  );
  for (const row of rows) {
    const plans: PlanTag[] =
      typeof row.plans === "string" ? JSON.parse(row.plans) : row.plans;
    result.set(
      String(row.student_id),
      plans.sort(
        (a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id),
      ),
    );
  }
  return result;
}
