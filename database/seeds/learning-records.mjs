import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { createRecord } from "../../server/db/learning-records.ts";
import { fixtureContext, seedContents } from "./learning-record-fixtures.mjs";

await runDatabaseCommand(async (db) => {
  const { actorId, studentIds } = await fixtureContext(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s3:fixtures",
  ]);
  if (Number(lock[0].acquired) !== 1)
    throw new Error("Fixture execution in progress");
  let created = 0;
  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      for (const studentId of studentIds.slice(0, 2)) {
        await db.execute(
          "SELECT id FROM students WHERE id=? LIMIT 1 FOR UPDATE",
          [studentId],
        );
        const [existing] = await db.execute(
          "SELECT id FROM student_learning_records WHERE student_id=? LIMIT 1",
          [studentId],
        );
        if (existing.length) continue; // Never overwrite, top up or delete existing records.
        for (let index = 0; index < 3; index++) {
          await createRecord(
            db,
            {
              studentId,
              category: ["缺", "补", "强"][index],
              content: seedContents[index],
              occurredOn: ["2000-01-01", "2000-01-02", "2000-01-03"][index],
            },
            actorId,
          );
          created++;
        }
      }
      await assertApprovedDatabase(db);
      await db.commit();
      console.log(
        `S3标准合成装载：新增${created}条；最多6条，已有记录的学生跳过。`,
      );
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s3:fixtures"]);
  }
});
