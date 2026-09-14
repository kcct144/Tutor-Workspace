import type { Connection, RowDataPacket } from "mysql2/promise";
import type { HomeActivity, HomePendingTask } from "../../types/api/home.ts";

/** Only receives IDs already selected by the authorized student page. */
export async function homeTaskData(
  db: Connection,
  ids: string[],
  today: string,
) {
  const pending = new Map<
    string,
    { pendingTasks: HomePendingTask[]; pendingCount: number }
  >();
  const activities = new Map<string, HomeActivity[]>();
  if (!ids.length) return { pending, activities };
  const placeholders = ids.map(() => "?").join(",");
  const [tasks] = await db.execute<RowDataPacket[]>(
    `SELECT id,student_id,task_title,due_date,version,group_count FROM (
      SELECT a.id,a.student_id,t.title AS task_title,a.due_date,a.version,
      COUNT(*) OVER (PARTITION BY a.student_id) AS group_count,
      ROW_NUMBER() OVER (PARTITION BY a.student_id ORDER BY a.due_date ASC,a.id ASC) AS rn
      FROM task_assignments a JOIN tasks t ON t.id=a.task_id
      WHERE a.status='pending' AND a.student_id IN (${placeholders})
    ) ranked WHERE rn<=3 ORDER BY student_id,rn LIMIT ?`,
    [...ids, ids.length * 3],
  );
  for (const row of tasks) {
    const key = String(row.student_id);
    const group = pending.get(key) ?? {
      pendingTasks: [],
      pendingCount: Number(row.group_count),
    };
    group.pendingTasks.push({
      id: String(row.id),
      taskTitle: row.task_title,
      dueDate: row.due_date,
      dueState:
        row.due_date < today
          ? "overdue"
          : row.due_date === today
            ? "today"
            : "upcoming",
      status: "pending",
      version: Number(row.version),
    });
    pending.set(key, group);
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT student_id,source_id,source_type,occurred_at,task_title,category,record_summary FROM (
      SELECT student_id,source_id,source_type,occurred_at,task_title,category,record_summary,ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY occurred_at DESC,source_id DESC,source_type DESC) AS rn FROM (
        SELECT a.student_id,a.id AS source_id,'task_completed' AS source_type,a.completed_at AS occurred_at,
          t.title AS task_title,NULL AS category,NULL AS record_summary
        FROM task_assignments a JOIN tasks t ON t.id=a.task_id
        WHERE a.student_id IN (${placeholders}) AND a.status='completed' AND a.completed_at IS NOT NULL
        UNION ALL
        SELECT r.student_id,r.id AS source_id,'learning_record_created' AS source_type,r.created_at AS occurred_at,
          NULL AS task_title,r.category,LEFT(r.content,48) AS record_summary
        FROM student_learning_records r WHERE r.student_id IN (${placeholders})
      ) events
    ) ranked WHERE rn<=5 ORDER BY student_id,occurred_at DESC,source_id DESC,source_type DESC LIMIT ?`,
    [...ids, ...ids, ids.length * 5],
  );
  for (const row of rows) {
    const key = String(row.student_id);
    const base = {
      id: `activity:${row.source_type}:${row.source_id}`,
      occurredAt: String(row.occurred_at).replace(" ", "T") + "Z",
    };
    const activity: HomeActivity =
      row.source_type === "task_completed"
        ? { ...base, type: "task_completed", taskTitle: row.task_title }
        : {
            ...base,
            type: "learning_record_created",
            category: row.category,
            recordSummary: Array.from(String(row.record_summary))
              .slice(0, 48)
              .join("")
              .replace(/\s+/gu, " "),
          };
    activities.set(key, [...(activities.get(key) ?? []), activity]);
  }
  return { pending, activities };
}
