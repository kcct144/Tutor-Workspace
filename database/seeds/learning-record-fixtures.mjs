import assert from "node:assert/strict";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";

export const seedContents = [
  "S3标准演示：识别知识缺口。",
  "S3标准演示：完成针对性补充练习。",
  "S3标准演示：强化已掌握内容。",
];
export const apiContents = [
  "S3固定验收甲：学习表现。",
  "S3固定验收乙：补充练习。",
];
export const browserContent = "S3固定浏览器验收：学习表现。";
export async function fixtureContext(db) {
  const actorId = await resolveSeedAdministrator(db);
  const [actor] = await db.execute(
    "SELECT id FROM users WHERE id=? AND name=? LIMIT 1",
    [actorId, "S1合成演示老师"],
  );
  assert.equal(actor.length, 1);
  const [students] = await db.execute(
    "SELECT id,name FROM students WHERE name IN (?,?,?,?) AND note=? ORDER BY name LIMIT 5",
    [
      "S1演示学生09",
      "S1演示学生10",
      "S1演示学生11",
      "S1演示学生12",
      "仅用于S1联调的合成记录，不代表真实学生。",
    ],
  );
  assert.equal(students.length, 4);
  assert.equal(new Set(students.map((s) => s.name)).size, 4);
  return { actorId, studentIds: students.map((s) => String(s.id)) };
}
