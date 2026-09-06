import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Page } from "../../types/api/students.ts";
import type {
  PlanTag,
  PlanDetail,
  PlanListItem,
  PlanQuery,
  PlanUpdate,
} from "../../types/api/study-plans.ts";
import { likeValue } from "./contracts.ts";
import { executeWrite } from "./write.ts";
import { ApiError } from "../utils/api.ts";
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
export async function findPlan(
  db: Connection,
  id: string,
): Promise<PlanDetail> {
  const [rows] = await db.execute<PlanRow[]>(
    "SELECT p.id,p.title,p.summary,p.content,p.version,p.created_at,p.updated_at,p.owner_user_id,u.name AS owner_name FROM study_plan_documents p JOIN users u ON u.id=p.owner_user_id WHERE p.id=? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到学习计划。");
  return projectPlanDetail(rows[0]);
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
