import assert from "node:assert/strict";
import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { taskActor, taskFixtures, verifyTasks } from "./task-fixtures.mjs";
await runDatabaseCommand(async (db) => {
  const actor = await taskActor(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s5:fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [rows] = await db.execute(
        "SELECT id FROM tasks ORDER BY id LIMIT 5 FOR UPDATE",
      );
      if (rows.length) {
        await verifyTasks(db, actor);
        await db.rollback();
        console.log("S5固定数据已存在，新增0条，不覆盖。");
        return;
      }
      for (const task of taskFixtures)
        await executeWrite(
          db,
          "INSERT INTO tasks (owner_user_id,title,subject,description,status) VALUES (?,?,?,?,?)",
          [actor, task.title, task.subject, task.description, task.status],
        );
      await assertApprovedDatabase(db);
      await db.commit();
      console.log("S5种子完成：2条固定任务；无其他领域写入。");
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s5:fixtures"]);
  }
});
