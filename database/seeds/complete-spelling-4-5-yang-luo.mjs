import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const planTitle = "拼读训练计划";
const subject = "英语";
const today = "2026-09-10";
const completedAt = "2026-09-10 12:00:00.000";
const students = ["杨梓欣", "罗诗琪"];
const taskTitles = [4, 5].flatMap((group) => [
  `拼读 ${group}-读`,
  `拼读 ${group}-听写`,
]);

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:complete-spelling-4-5-yang-luo:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("无法获得读取锁，请稍后重试。");

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [plans] = await db.execute(
        "SELECT id FROM study_plan_documents WHERE title=? LIMIT 1 FOR SHARE",
        [planTitle],
      );
      if (plans.length !== 1) throw new Error("未能唯一找到拼读训练计划。");
      const planId = String(plans[0].id);
      let completed = 0;

      for (const studentName of students) {
        const [studentRows] = await db.execute(
          "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
          [studentName],
        );
        if (studentRows.length !== 1) throw new Error(`未能唯一找到学员：${studentName}`);
        const studentId = String(studentRows[0].id);

        for (const taskTitle of taskTitles) {
          const [tasks] = await db.execute(
            "SELECT id,study_plan_id,status FROM tasks WHERE title=? AND subject=? LIMIT 1 FOR SHARE",
            [taskTitle, subject],
          );
          if (tasks.length !== 1) throw new Error(`未能唯一找到拼读任务：${taskTitle}`);
          if (String(tasks[0].study_plan_id) !== planId) throw new Error(`任务未关联拼读训练计划：${taskTitle}`);
          if (tasks[0].status !== "enabled") throw new Error(`任务已停用：${taskTitle}`);

          const [assignments] = await db.execute(
            "SELECT id,status FROM task_assignments WHERE task_id=? AND student_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [tasks[0].id, studentId],
          );
          const existing = assignments[0];
          if (!existing) {
            await executeWrite(
              db,
              "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,?)",
              [tasks[0].id, studentId, planId, actorId, "completed", today, completedAt],
            );
          } else if (existing.status !== "completed") {
            await executeWrite(
              db,
              "UPDATE task_assignments SET study_plan_id_snapshot=?,status='completed',due_date=?,completed_at=?,version=version+1 WHERE id=?",
              [planId, today, completedAt, existing.id],
            );
          }
          completed += 1;
        }
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`杨梓欣、罗诗琪拼读第4、5组完成：${completed}条任务已标记完成。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:complete-spelling-4-5-yang-luo:seed",
    ]);
  }
});
