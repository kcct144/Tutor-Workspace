import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const subject = "英语";
const today = "2026-09-09";
const completedAt = "2026-09-09 12:00:00.000";
const requests = [
  { student: "丘亿燃", plan: "精读课文计划（英语）", task: "九上 1-1", createIfMissing: false },
  { student: "丘亿燃", plan: "Busuu 计划", task: "Busuu 2-9", createIfMissing: true },
  { student: "杨梓欣", plan: "Busuu 计划", task: "Busuu 1-6", createIfMissing: true },
  { student: "杨梓欣", plan: "拼读训练计划", task: "拼读 2-读", createIfMissing: false },
  { student: "杨梓欣", plan: "拼读训练计划", task: "拼读 2-听写", createIfMissing: false },
  { student: "杨梓欣", plan: "拼读训练计划", task: "拼读 3-读", createIfMissing: false },
  { student: "杨梓欣", plan: "拼读训练计划", task: "拼读 3-听写", createIfMissing: false },
  { student: "罗诗琪", plan: "拼读训练计划", task: "拼读 2-读", createIfMissing: false },
  { student: "罗诗琪", plan: "拼读训练计划", task: "拼读 2-听写", createIfMissing: false },
  { student: "罗诗琪", plan: "拼读训练计划", task: "拼读 3-读", createIfMissing: false },
  { student: "罗诗琪", plan: "拼读训练计划", task: "拼读 3-听写", createIfMissing: false },
  { student: "罗诗琪", plan: "Busuu 计划", task: "Busuu 1-10", createIfMissing: true },
];

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:complete-reading-busuu-spelling:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) {
    throw new Error("无法获得读取锁，请稍后重试。");
  }

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const planIds = new Map();
      const studentIds = new Map();
      const taskIds = new Map();
      let linkedPlans = 0;
      let createdTasks = 0;
      let completedAssignments = 0;

      for (const request of requests) {
        let planId = planIds.get(request.plan);
        if (!planId) {
          const [plans] = await db.execute(
            "SELECT id FROM study_plan_documents WHERE title=? LIMIT 1 FOR SHARE",
            [request.plan],
          );
          if (plans.length !== 1) throw new Error(`未能唯一找到学习计划：${request.plan}`);
          planId = String(plans[0].id);
          planIds.set(request.plan, planId);
        }

        let studentId = studentIds.get(request.student);
        if (!studentId) {
          const [students] = await db.execute(
            "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
            [request.student],
          );
          if (students.length !== 1) throw new Error(`未能唯一找到学员：${request.student}`);
          studentId = String(students[0].id);
          studentIds.set(request.student, studentId);
        }

        const linkKey = `${planId}:${studentId}`;
        if (!planIds.has(linkKey)) {
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
            linkedPlans += 1;
          }
          planIds.set(linkKey, planId);
        }

        const taskKey = `${request.plan}:${request.task}`;
        let taskId = taskIds.get(taskKey);
        if (!taskId) {
          const [tasks] = await db.execute(
            "SELECT id,study_plan_id,status FROM tasks WHERE title=? AND subject=? LIMIT 1 FOR UPDATE",
            [request.task, subject],
          );
          if (!tasks.length) {
            if (!request.createIfMissing) throw new Error(`未找到任务：${request.task}`);
            const result = await executeWrite(
              db,
              "INSERT INTO tasks (owner_user_id,study_plan_id,title,subject,description,status) VALUES (?,?,?,?,?,?)",
              [actorId, planId, request.task, subject, `完成${request.task}。`, "enabled"],
            );
            taskId = String(result.insertId);
            createdTasks += 1;
          } else {
            if (String(tasks[0].study_plan_id) !== planId) throw new Error(`任务未关联指定学习计划：${request.task}`);
            if (tasks[0].status !== "enabled") throw new Error(`任务已停用：${request.task}`);
            taskId = String(tasks[0].id);
          }
          taskIds.set(taskKey, taskId);
        }

        const [assignments] = await db.execute(
          "SELECT id,status FROM task_assignments WHERE task_id=? AND student_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [taskId, studentId],
        );
        const existing = assignments[0];
        if (!existing) {
          await executeWrite(
            db,
            "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,?)",
            [taskId, studentId, planId, actorId, "completed", today, completedAt],
          );
        } else if (existing.status !== "completed") {
          await executeWrite(
            db,
            "UPDATE task_assignments SET study_plan_id_snapshot=?,status='completed',due_date=?,completed_at=?,version=version+1 WHERE id=?",
            [planId, today, completedAt, existing.id],
          );
        }
        completedAssignments += 1;
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`任务完成：完成记录 ${completedAssignments} 条；新增任务 ${createdTasks} 条；新增计划关联 ${linkedPlans} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:complete-reading-busuu-spelling:seed",
    ]);
  }
});
