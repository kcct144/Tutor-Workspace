import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { createRecord } from "../../server/db/learning-records.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const studentName = "李倍西";
const subject = "英语";
const category = "补";
const content = "讲解阅读理解一定要利用主旨做题";
const occurredOn = "2026-09-10";

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:create-reading-main-idea-makeup-li-beixi:seed",
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
      if (students.length !== 1) throw new Error("未能唯一找到李倍西。");

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
      console.log("李倍西学习记录新增完成：英语阅读主旨做题补充 1 条。");
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:create-reading-main-idea-makeup-li-beixi:seed",
    ]);
  }
});
