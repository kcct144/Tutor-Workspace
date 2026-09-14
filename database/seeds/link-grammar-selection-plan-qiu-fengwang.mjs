import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";

const studentName = "邱烽旺";
const planTitle = "语法选择计划";

await runDatabaseCommand(async (db) => {
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:link-grammar-selection-plan-qiu-fengwang:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("无法获得读取锁，请稍后重试。");

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [students] = await db.execute(
        "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
        [studentName],
      );
      if (students.length !== 1) throw new Error("未能唯一找到邱烽旺。");
      const studentId = String(students[0].id);

      const [plans] = await db.execute(
        "SELECT id FROM study_plan_documents WHERE title=? LIMIT 1 FOR SHARE",
        [planTitle],
      );
      if (plans.length !== 1) throw new Error("未能唯一找到语法选择计划。");
      const planId = String(plans[0].id);

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

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`邱烽旺语法选择计划关联完成：新增 ${linked} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:link-grammar-selection-plan-qiu-fengwang:seed",
    ]);
  }
});
