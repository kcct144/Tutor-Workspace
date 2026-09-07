import { runDatabaseCommand } from "../connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";
import { createContract } from "../../server/db/contracts.ts";
import { shanghaiToday } from "../../server/db/contracts-rules.ts";

await runDatabaseCommand(async (connection) => {
  const actorId = await resolveSeedAdministrator(connection);
  const [actor] = await connection.execute(
    "SELECT id FROM users WHERE id = ? AND name = ? LIMIT 1",
    [actorId, "S1合成演示老师"],
  );
  if (!actor.length) throw new Error("Only synthetic actor allowed");
  const [lock] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [
    "tutor_workspace:s2:seed",
  ]);
  if (Number(lock[0].acquired) !== 1) throw new Error("Seed in progress");
  let created = 0;
  try {
    await assertApprovedDatabase(connection);
    await connection.beginTransaction();
    try {
      const [students] = await connection.execute(
        "SELECT id FROM students WHERE name IN (?, ?) AND note = ? ORDER BY id LIMIT 2 FOR UPDATE",
        [
          "S1演示学生01",
          "S1演示学生02",
          "仅用于S1联调的合成记录，不代表真实学生。",
        ],
      );
      if (students.length !== 2)
        throw new Error("Synthetic students not found");
      const today = shanghaiToday();
      const day = (offset) => {
        const date = new Date(today + "T00:00:00Z");
        date.setUTCDate(date.getUTCDate() + offset);
        return date.toISOString().slice(0, 10);
      };
      for (let index = 0; index < students.length; index++) {
        const studentId = String(students[index].id);
        const [existing] = await connection.execute(
          "SELECT id FROM contracts WHERE student_id = ? LIMIT 1",
          [studentId],
        );
        if (existing.length) continue; // Never overwrite or top up an existing student's contracts.
        const base = {
          studentId,
          subject: "S2演示数学",
          contractType: "month",
          startDate: today,
          endDate: day(10),
          attendedLessons: null,
          totalLessons: null,
          makeupLessons: 0,
        };
        const inputs =
          index === 0
            ? [
                base,
                { ...base, contractType: "half_year", endDate: day(5) },
                {
                  ...base,
                  subject: "S2演示未来",
                  contractType: "year",
                  startDate: day(1),
                  endDate: day(365),
                },
                {
                  ...base,
                  subject: "S2演示过期",
                  startDate: day(-30),
                  endDate: day(-1),
                },
                {
                  ...base,
                  subject: "S2演示英语",
                  contractType: "lessons",
                  startDate: null,
                  endDate: null,
                  attendedLessons: 0,
                  totalLessons: 10,
                },
              ]
            : [
                {
                  ...base,
                  subject: "S2演示耗尽",
                  contractType: "lessons",
                  startDate: null,
                  endDate: null,
                  attendedLessons: 10,
                  totalLessons: 10,
                },
              ];
        for (const input of inputs) {
          await createContract(connection, input, actorId);
          created++;
        }
      }
      await assertApprovedDatabase(connection);
      await connection.commit();
      console.log(
        `S2合成合同装载完成：新增${created}条；已有合同的学生不写入、不覆盖。`,
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:s2:seed",
    ]);
  }
});
