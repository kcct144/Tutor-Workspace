import type { Connection, RowDataPacket } from "mysql2/promise";
import type { HomeQuery, HomePage, HomeStudent } from "../../types/api/home.ts";
import { contractStatusSql, shanghaiToday } from "./contracts-rules.ts";
import { studentContractAggregates } from "./contracts.ts";
import { studentPlanTags } from "./study-plans.ts";
import { homeTaskData } from "./home-activities.ts";
import type { AuthContext } from "../auth/context.ts";
import { studentTagMap } from "./student-tags.ts";
import { responsibleSubjectsForUser } from "./responsible-subjects.ts";
export async function listHome(
  db: Connection,
  query: HomeQuery & { page: number; pageSize: number },
  auth: Pick<AuthContext, "role" | "userId">,
  today = shanghaiToday(),
): Promise<HomePage> {
  const scope =
    " WHERE status='在读'" +
    (auth.role === "admin" ? "" : " AND owner_user_id=?");
  const scopeValues = auth.role === "admin" ? [] : [auth.userId];
  const [active] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM students" + scope + " LIMIT 1",
    scopeValues,
  );
  const subjectMode = query.subjectMode ?? "responsible";
  const subjects =
    subjectMode === "responsible"
      ? await responsibleSubjectsForUser(db, auth.userId)
      : subjectMode === "selected"
        ? (query.subject ?? [])
        : [];
  const subjectConfigurationRequired =
    subjectMode === "responsible" && subjects.length === 0;
  if (subjectConfigurationRequired)
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      activeStudents: Number(active[0]!.total),
      asOfDate: today,
      subjectConfigurationRequired: true,
    };
  const subjectFilter = subjects.length
    ? " AND EXISTS (SELECT 1 FROM contracts c WHERE c.student_id=students.id AND c.subject COLLATE utf8mb4_0900_bin IN (" +
      subjects.map(() => "?").join(",") +
      ") AND ((" +
      contractStatusSql +
      ")='生效中' OR (" +
      contractStatusSql +
      ")='进行中'))"
    : "";
  const where =
    scope +
    (query.grade ? " AND grade=?" : "") +
    (query.tag
      ? " AND EXISTS (SELECT 1 FROM student_tags st WHERE st.student_id=students.id AND st.tag=?)"
      : "") +
    subjectFilter;
  const values = [
    ...scopeValues,
    ...(query.grade ? [query.grade] : []),
    ...(query.tag ? [query.tag] : []),
    ...subjects,
    ...(subjects.length ? [today, today, today, today] : []),
  ];
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM students" + where + " LIMIT 1",
    values,
  );
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id,name,grade,school FROM students" +
      where +
      " ORDER BY id DESC LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const ids = rows.map((row) => String(row.id));
  const tags = await studentTagMap(db, ids);
  const contracts = await studentContractAggregates(db, ids, today),
    plans = await studentPlanTags(db, ids),
    assignments = await homeTaskData(db, ids, today);
  const items: HomeStudent[] = rows.map((row) => {
    const id = String(row.id),
      contract = contracts.get(id) ?? { subjects: [], expiryDate: null },
      tasks = assignments.pending.get(id) ?? {
        pendingTasks: [],
        pendingCount: 0,
      };
    return {
      id,
      tags: tags.get(id) ?? [],
      name: row.name,
      grade: row.grade,
      school: row.school,
      status: "在读",
      ...contract,
      expiresInDays:
        contract.expiryDate === null
          ? null
          : Math.round(
              (Date.parse(contract.expiryDate + "T00:00:00Z") -
                Date.parse(today + "T00:00:00Z")) /
                86400000,
            ),
      plans: plans.get(id) ?? [],
      ...tasks,
      activities: assignments.activities.get(id) ?? [],
      pendingRemaining: Math.max(
        0,
        tasks.pendingCount - tasks.pendingTasks.length,
      ),
    };
  });
  return {
    items,
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
    activeStudents: Number(active[0]!.total),
    asOfDate: today,
    subjectConfigurationRequired: false,
  };
}
