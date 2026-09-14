import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const taskTitle = "临时｜九上 Unit1 写作训练";
const subject = "英语";
const description = "完成九年级上册 Unit 1 写作训练。";
const dueDate = "2026-09-13";
const studentNames = ["管紫瑶", "黄佳睿", "蔡紫轩", "曾梓媛", "张钰润", "李倍西"];

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tw:temp-writing-guan-huang:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("无法获得读取锁，请稍后重试。");

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [existingTasks] = await db.execute(
        "SELECT id,study_plan_id,status FROM tasks WHERE title=? AND subject=? LIMIT 1 FOR UPDATE",
        [taskTitle, subject],
      );
      let taskId;
      let created = 0;
      console.log("临时任务：开始处理任务主体");
      if (!existingTasks.length) {
        const result = await executeWrite(
          db,
          "INSERT INTO tasks (owner_user_id,study_plan_id,title,subject,description,status) VALUES (?,?,?,?,?,?)",
          [actorId, null, taskTitle, subject, description, "enabled"],
        );
        taskId = String(result.insertId);
        created = 1;
        console.log("临时任务：任务主体已创建");
      } else {
        if (existingTasks[0].study_plan_id !== null) throw new Error("同名任务已关联学习计划，未改作临时任务。");
        if (existingTasks[0].status !== "enabled") throw new Error("同名临时任务已停用。");
        taskId = String(existingTasks[0].id);
      }

      let assigned = 0;
      console.log("临时任务：开始处理学员分配");
      for (const studentName of studentNames) {
        const [students] = await db.execute(
          "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
          [studentName],
        );
        if (students.length !== 1) throw new Error(`未能唯一找到学员：${studentName}`);
        const studentId = String(students[0].id);

        const [pending] = await db.execute(
          "SELECT id FROM task_assignments WHERE task_id=? AND student_id=? AND status='pending' LIMIT 1 FOR UPDATE",
          [taskId, studentId],
        );
        if (!pending.length) {
          await executeWrite(
            db,
            "INSERT INTO task_assignments (task_id,student_id,study_plan_id_snapshot,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?,NULL)",
            [taskId, studentId, null, actorId, "pending", dueDate],
          );
          assigned += 1;
        }
      }
      console.log("临时任务：学员分配已处理");

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`临时写作任务完成：新建任务 ${created} 条，新增待完成分配 ${assigned} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tw:temp-writing-guan-huang:seed",
    ]);
  }
});
