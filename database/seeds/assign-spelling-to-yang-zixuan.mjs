import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const studentName = "杨梓萱";
const planTitle = "拼读训练计划";
const subject = "英语";
const yesterday = "2026-09-08";
const today = "2026-09-09";
const completedAt = "2026-09-08 12:00:00.000";
const taskRows = [
  ...[1, 2].flatMap((group) => [
    { title: `拼读 ${group}-读`, completed: true },
    { title: `拼读 ${group}-听写`, completed: true },
  ]),
  ...[3, 4, 5].flatMap((group) => [
    { title: `拼读 ${group}-读`, completed: false },
    { title: `拼读 ${group}-听写`, completed: false },
  ]),
];

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:assign-spelling-yang-zixuan:seed",
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
      if (!plans.length) throw new Error("未找到拼读训练学习计划。");
      const planId = String(plans[0].id);

      const [students] = await db.execute(
        "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
        [studentName],
      );
      if (students.length !== 1) throw new Error("未能唯一找到杨梓萱。");
      const studentId = String(students[0].id);

      const [links] = await db.execute(
        "SELECT plan_id FROM study_plan_students WHERE plan_id=? AND student_id=? LIMIT 1 FOR UPDATE",
        [planId, studentId],
      );
      let linked = 0;
      if (!links.length) {
        await executeWrite(
          db,
          "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
          [planId, studentId],
        );
        linked = 1;
      }

      let completedCount = 0;
      let pendingCount = 0;
      for (const row of taskRows) {
        const [tasks] = await db.execute(
          "SELECT id,study_plan_id,status FROM tasks WHERE title=? AND subject=? LIMIT 1 FOR SHARE",
          [row.title, subject],
        );
        if (!tasks.length) throw new Error(`未找到拼读任务：${row.title}`);
        if (String(tasks[0].study_plan_id) !== planId) throw new Error(`任务未关联拼读训练学习计划：${row.title}`);
        if (tasks[0].status !== "enabled") throw new Error(`任务已停用：${row.title}`);

        const [assignments] = await db.execute(
          "SELECT id,status FROM task_assignments WHERE task_id=? AND student_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [tasks[0].id, studentId],
        );
        const existing = assignments[0];
        if (row.completed) {
          if (!existing) {
            await executeWrite(
              db,
              "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,?)",
              [tasks[0].id, studentId, planId, actorId, "completed", yesterday, completedAt],
            );
          } else {
            await executeWrite(
              db,
              "UPDATE task_assignments SET study_plan_id_snapshot=?,status='completed',due_date=?,completed_at=?,version=version+1 WHERE id=?",
              [planId, yesterday, completedAt, existing.id],
            );
          }
          completedCount += 1;
        } else {
          if (existing && existing.status === "completed") {
            throw new Error(`第 ${row.title.split(" ")[1].split("-")[0]} 组任务已有完成记录，未改回待完成。`);
          }
          if (!existing) {
            await executeWrite(
              db,
              "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,NULL)",
              [tasks[0].id, studentId, planId, actorId, "pending", today],
            );
          }
          pendingCount += 1;
        }
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`杨梓萱拼读任务完成：昨天完成 ${completedCount} 条，今天待完成 ${pendingCount} 条；新增计划关联 ${linked} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:assign-spelling-yang-zixuan:seed",
    ]);
  }
});
