import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";

await runDatabaseCommand(async (connection) => {
  await assertApprovedDatabase(connection);
  const [lock] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [
    "tutor_workspace:s1:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) {
    console.error("未取得S1装载执行锁，未写入数据。");
    throw new Error("Seed already running");
  }
  try {
    await connection.beginTransaction();
    try {
      const [migration] = await connection.execute(
        "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1",
        ["001_students"],
      );
      if (!migration.length) throw new Error("Run migrations first");
      const [counts] = await connection.query(
        "SELECT (SELECT COUNT(*) FROM users) AS users_count, (SELECT COUNT(*) FROM students) AS students_count",
      );
      if (Number(counts[0].users_count) || Number(counts[0].students_count)) {
        console.log("已有人员或学生数据，未装载、未覆盖。");
        await connection.rollback();
        return;
      }
      const [actor] = await connection.execute(
        "INSERT INTO users (name) VALUES (?)",
        ["S1合成演示老师"],
      );
      const actorId = String(actor.insertId);
      const grades = ["初一", "初二", "初三", "高一", "高二"];
      const statuses = ["在读", "待分配", "已结课"];
      for (let index = 1; index <= 12; index++) {
        const status = statuses[(index - 1) % statuses.length];
        await connection.execute(
          "INSERT INTO students (owner_user_id, name, grade, class_name, school, gender, enrolled_at, guardian_name, guardian_phone, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            status === "待分配" ? null : actorId,
            "S1演示学生" + String(index).padStart(2, "0"),
            grades[(index - 1) % grades.length],
            index % 4 === 0 ? null : "演示班",
            "合成示例学校",
            index % 2 === 0 ? null : "女",
            "2026-09-05",
            "合成监护人",
            null,
            "仅用于S1联调的合成记录，不代表真实学生。",
            status,
          ],
        );
      }
      await connection.commit();
      console.log("已显式装载12名合成演示学生。");
      console.log("演示人员ID（请手工填写本机 DEV_ACTOR_ID）：" + actorId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:s1:seed",
    ]);
  }
});
