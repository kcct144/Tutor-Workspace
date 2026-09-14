import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

const planTitle = "高频1000词背诵";
const subject = "英语";
const units = Array.from({ length: 20 }, (_, index) => index + 1);

await runDatabaseCommand(async (db) => {
  const actorId = await resolveSeedAdministrator(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tw:create-high-frequency-1000-words:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("无法获得读取锁，请稍后重试。");

  try {
    await assertApprovedDatabase(db);
    await db.beginTransaction();
    try {
      const [existingPlans] = await db.execute(
        "SELECT id FROM study_plan_documents WHERE title=? LIMIT 1 FOR UPDATE",
        [planTitle],
      );
      if (existingPlans.length) throw new Error(`学习计划已存在：${planTitle}`);

      const planResult = await executeWrite(
        db,
        "INSERT INTO study_plan_documents (owner_user_id,title,summary,content) VALUES (?,?,?,?)",
        [
          actorId,
          planTitle,
          "高频1000词背诵计划，共 20 个单元。",
          "# 高频1000词背诵\n\n共 20 个任务：Unit 1 - Unit 20。",
        ],
      );
      const planId = String(planResult.insertId);

      for (const unit of units) {
        await executeWrite(
          db,
          "INSERT INTO tasks (owner_user_id,study_plan_id,title,subject,description,status) VALUES (?,?,?,?,?,?)",
          [
            actorId,
            planId,
            `${planTitle} Unit ${unit}`,
            subject,
            `完成${planTitle} Unit ${unit}。`,
            "enabled",
          ],
        );
      }

      await assertApprovedDatabase(db);
      await db.commit();
      console.log(`高频1000词背诵计划创建完成：新增计划 1 份，新增任务 ${units.length} 条。`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", [
      "tw:create-high-frequency-1000-words:seed",
    ]);
  }
});
