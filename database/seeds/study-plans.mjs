import assert from "node:assert/strict";
import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import {
  planFixtures,
  planFixtureContext,
  verifyPlanFixtures,
} from "./study-plan-fixtures.mjs";
await runDatabaseCommand(async (db) => {
  const { actorId, studentIds } = await planFixtureContext(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s4:fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [documents] = await db.execute(
        "SELECT id FROM study_plan_documents ORDER BY id LIMIT ? FOR UPDATE",
        [4],
      );
      const [links] = await db.execute(
        "SELECT plan_id,student_id FROM study_plan_students ORDER BY plan_id,student_id LIMIT ? FOR UPDATE",
        [5],
      );
      if (documents.length || links.length) {
        await verifyPlanFixtures(db, actorId, studentIds);
        await db.rollback();
        console.log("S4固定种子已存在，新增0份文档/0条关系，不覆盖正文。");
        return;
      }
      const ids = [];
      for (const plan of planFixtures) {
        const result = await executeWrite(
          db,
          "INSERT INTO study_plan_documents (owner_user_id,title,summary,content) VALUES (?,?,?,?)",
          [actorId, plan.title, plan.summary, plan.content],
        );
        ids.push(String(result.insertId));
      }
      for (const [planId, studentId] of [
        [ids[0], studentIds[0]],
        [ids[0], studentIds[1]],
        [ids[1], studentIds[0]],
        [ids[2], studentIds[2]],
      ])
        await executeWrite(
          db,
          "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
          [planId, studentId],
        );
      await verifyPlanFixtures(db, actorId, studentIds);
      await assertApprovedDatabase(db);
      await db.commit();
      console.log("S4固定种子完成：新增3份计划、4条关系，无其他领域写入。");
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s4:fixtures"]);
  }
});
