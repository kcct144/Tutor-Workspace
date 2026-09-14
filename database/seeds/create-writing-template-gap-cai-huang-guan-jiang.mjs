import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { createRecord } from "../../server/db/learning-records.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const subject = "英语";
const category = "缺";
const content = "写作没有模板意识，没有收集模板句和写作材料的习惯";
const occurredOn = "2026-09-13";
const studentNames = ["蔡紫轩", "黄佳睿", "管紫瑶", "江晓晨"];

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tw:writing-template-gap:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("无法获得读取锁，请稍后重试。");

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      for (const studentName of studentNames) {
        const [students] = await db.execute(
          "SELECT id FROM students WHERE name=? ORDER BY id LIMIT 2 FOR SHARE",
          [studentName],
        );
        if (students.length !== 1) throw new Error(`未能唯一找到学员：${studentName}`);

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
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`英语写作学习记录新增完成：${studentNames.length}条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tw:writing-template-gap:seed",
    ]);
  }
});
