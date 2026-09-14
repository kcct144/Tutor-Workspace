import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { createRecord } from "../../server/db/learning-records.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const studentName = "黄佳睿";
const subject = "英语";
const category = "缺";
const content = "作文句子过于零散，语法错误很多";
const occurredOn = "2026-09-13";

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tw:writing-fragmented-gap-huang:seed",
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
      if (students.length !== 1) throw new Error("未能唯一找到黄佳睿。");

      await createRecord(
        db,
        {
          studentId: String(students[0].id),
          category,
          subject,
          content,
          occurredOn,
        },
        actorId,
      );

      await assertApprovedDatabase(db);
      await db.commit();
      console.log("黄佳睿英语写作学习记录新增完成：1条。");
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tw:writing-fragmented-gap-huang:seed",
    ]);
  }
});
