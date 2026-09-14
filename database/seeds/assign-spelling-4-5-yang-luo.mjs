import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const planTitle = "拼读训练计划";
const subject = "英语";
const dueDate = "2026-09-10";
const students = ["杨梓欣", "罗诗琪"];
const taskTitles = [4, 5].flatMap((group) => [
  `拼读 ${group}-读`,
  `拼读 ${group}-听写`,
]);

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:assign-spelling-4-5-yang-luo:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) {
    throw new Error("无法获得读取锁，请稍后重试。");
  }

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
      let assigned = 0;
      let linked = 0;

      for (const studentName of students) {
        const [studentRows] = await db.execute(
          "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
          [studentName],
        );
        if (studentRows.length !== 1) throw new Error(`未能唯一找到学员：${studentName}`);
        const studentId = String(studentRows[0].id);

        const [links] = await db.execute(
          "SELECT plan_id FROM study_plan_students WHERE plan_id=? AND student_id=? LIMIT 1 FOR UPDATE",
          [planId, studentId],
        );
        if (!links.length) {
          await executeWrite(
            db,
            "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
            [planId, studentId],
          );
          linked += 1;
        }

        for (const taskTitle of taskTitles) {
          const [tasks] = await db.execute(
            "SELECT id,study_plan_id,status FROM tasks WHERE title=? AND subject=? LIMIT 1 FOR SHARE",
            [taskTitle, subject],
          );
          if (tasks.length !== 1) throw new Error(`未能唯一找到拼读任务：${taskTitle}`);
          if (String(tasks[0].study_plan_id) !== planId) throw new Error(`任务未关联拼读训练计划：${taskTitle}`);
          if (tasks[0].status !== "enabled") throw new Error(`任务已停用：${taskTitle}`);

          const [pending] = await db.execute(
            "SELECT id,status FROM task_assignments WHERE task_id=? AND student_id=? AND status='pending' LIMIT 1 FOR UPDATE",
            [tasks[0].id, studentId],
          );
          if (!pending.length) {
            await executeWrite(
              db,
              "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,NULL)",
              [tasks[0].id, studentId, planId, actorId, "pending", dueDate],
            );
            assigned += 1;
          }
        }
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`拼读第4、5组分配完成：新增待完成任务 ${assigned} 条；新增计划关联 ${linked} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:assign-spelling-4-5-yang-luo:seed",
    ]);
  }
});
