import assert from "node:assert/strict";
import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { shanghaiToday } from "../../server/db/contracts-rules.ts";
import {
  assignmentContext,
  seedAssignments,
  verifyAssignments,
  s6ProtectedSnapshot,
} from "./assignment-fixtures.mjs";
await runDatabaseCommand(async (db) => {
  const context = await assignmentContext(db),
    before = await s6ProtectedSnapshot(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "s6:assignment-fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [rows] = await db.execute(
        "SELECT id FROM task_assignments ORDER BY id LIMIT 15 FOR UPDATE",
      );
      if (rows.length) {
        await verifyAssignments(db, context);
        await db.rollback();
        console.log("S6固定分配已存在，新增0条，不覆盖。");
        return;
      }
      for (const row of seedAssignments(context, shanghaiToday()))
        await executeWrite(
          db,
          "INSERT INTO task_assignments (task_id,student_id,assigned_by,status,due_date,completed_at) VALUES (?,?,?,?,?,?)",
          [
            row.taskId,
            row.studentId,
            context.actor,
            row.status,
            row.dueDate,
            row.completedAt,
          ],
        );
      await assertApprovedDatabase(db);
      await db.commit();
      assert.deepEqual(await s6ProtectedSnapshot(db), before);
      console.log("S6固定历史演示种子9条；S1–S5指纹不变。");
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["s6:assignment-fixtures"]);
  }
});
