import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";
export const taskFixtures = [
  {
    title: "S5标准任务甲",
    subject: "S5演示数学",
    description: "仅用于合成演示的任务甲。",
    status: "enabled",
  },
  {
    title: "S5标准任务乙",
    subject: "S5演示英语",
    description: "仅用于合成演示的任务乙。",
    status: "disabled",
  },
];
export const apiTask = {
  title: "S5固定API验收",
  subject: "S5验收科目",
  description: "S5固定API验收说明。",
};
export const browserTask = {
  title: "S5固定浏览器验收",
  subject: "S5浏览器科目",
  description: "S5固定浏览器验收说明。",
};
export async function taskActor(db) {
  const id = await resolveSeedAdministrator(db);
  const [rows] = await db.execute("SELECT name FROM users WHERE id=? LIMIT 1", [
    id,
  ]);
  assert.equal(rows[0]?.name, "S1合成演示老师");
  return id;
}
export async function verifyTasks(db, actor) {
  const [rows] = await db.execute(
    "SELECT id,owner_user_id,title,subject,description,status,version FROM tasks ORDER BY id LIMIT 5",
  );
  assert.ok(rows.length >= 2 && rows.length <= 4);
  for (const fixture of taskFixtures) {
    const matches = rows.filter((row) => row.title === fixture.title);
    assert.equal(matches.length, 1);
    for (const key of ["title", "subject", "description", "status"])
      assert.equal(matches[0][key], fixture[key]);
  }
  for (const row of rows) {
    assert.equal(String(row.owner_user_id), actor);
    if (taskFixtures.some((item) => item.title === row.title)) continue;
    const fixture = [apiTask, browserTask].find(
      (item) => item.title === row.title,
    );
    assert.ok(fixture);
    assert.equal(row.subject, fixture.subject);
    const allowed =
      fixture === apiTask
        ? [apiTask.description, "S5固定API编辑说明。", "界".repeat(10000)]
        : [browserTask.description, "S5固定浏览器编辑说明。"];
    assert.ok(allowed.includes(row.description));
    assert.ok(["enabled", "disabled"].includes(row.status));
    assert.equal(rows.filter((item) => item.title === row.title).length, 1);
  }
  return rows;
}
// Only approved S1–S4 tables. Hash rows in bounded pages; never print their contents.
export async function protectedSnapshot(db) {
  const tables = [
    ["users", "id"],
    ["students", "id"],
    ["contracts", "id"],
    ["student_learning_records", "id"],
    ["study_plan_documents", "id"],
    ["study_plan_students", "plan_id,student_id"],
    ["schema_migrations", "version"],
  ];
  const result = {};
  for (const [table, order] of tables) {
    const hash = createHash("sha256");
    let offset = 0;
    for (;;) {
      const [rows] = await db.execute(
        "SELECT * FROM " + table + " ORDER BY " + order + " LIMIT ? OFFSET ?",
        [100, offset],
      );
      for (const row of rows) hash.update(JSON.stringify(row));
      offset += rows.length;
      if (rows.length < 100) break;
    }
    result[table] = { count: offset, hash: hash.digest("hex") };
  }
  return result;
}
