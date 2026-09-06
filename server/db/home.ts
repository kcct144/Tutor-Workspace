import type { Connection, RowDataPacket } from "mysql2/promise";
import type { HomeQuery, HomePage, HomeStudent } from "../../types/api/home.ts";
import { shanghaiToday } from "./contracts-rules.ts";
import { studentContractAggregates } from "./contracts.ts";
import { studentPlanTags } from "./study-plans.ts";
import { studentAssignmentSummaries } from "./task-assignments.ts";
export async function listHome(
  db: Connection,
  query: HomeQuery & { page: number; pageSize: number },
  today = shanghaiToday(),
): Promise<HomePage> {
  const where = " WHERE status='在读'" + (query.grade ? " AND grade=?" : "");
  const values = query.grade ? [query.grade] : [];
  const [active] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM students WHERE status='在读' LIMIT 1",
  );
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
  const contracts = await studentContractAggregates(db, ids, today),
    plans = await studentPlanTags(db, ids),
    assignments = await studentAssignmentSummaries(db, ids, today);
  const items: HomeStudent[] = rows.map((row) => {
    const id = String(row.id),
      contract = contracts.get(id) ?? { subjects: [], expiryDate: null },
      tasks = assignments.get(id) ?? {
        pendingTasks: [],
        completedTasks: [],
        pendingCount: 0,
        completedCount: 0,
      };
    return {
      id,
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
      pendingRemaining: Math.max(
        0,
        tasks.pendingCount - tasks.pendingTasks.length,
      ),
      completedRemaining: Math.max(
        0,
        tasks.completedCount - tasks.completedTasks.length,
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
  };
}
