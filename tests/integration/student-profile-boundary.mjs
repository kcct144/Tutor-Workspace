import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { runDatabaseCommand } from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";

export const fixtureNames = [
  "S7固定最小档案",
  "S7固定重复档案",
  "S7固定浏览器档案",
];
export async function profileBoundary(db) {
  await assertApprovedDatabase(db);
  const snapshot = {};
  for (const [table, order] of Object.entries({
    users: "id",
    students: "id",
    contracts: "id",
    student_learning_records: "id",
    study_plan_documents: "id",
    study_plan_students: "plan_id,student_id",
    tasks: "id",
    task_assignments: "id",
    schema_migrations: "version",
  })) {
    const where =
      table === "students"
        ? " WHERE name NOT IN (?,?,?)"
        : table === "schema_migrations"
          ? " WHERE version<>?"
          : "";
    const args =
      table === "students"
        ? fixtureNames
        : table === "schema_migrations"
          ? ["007_students_version"]
          : [];
    const [rows] = await db.execute(
      "SELECT * FROM " + table + where + " ORDER BY " + order + " LIMIT 10001",
      args,
    );
    assert.ok(rows.length < 10001, "边界快照超过限定规模，停止");
    if (table === "students") {
      assert.equal(rows.length, 12, "原学生数量不匹配，停止");
      for (const row of rows) delete row.version;
    }
    snapshot[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  const [tables] = await db.query("SHOW TABLES");
  assert.equal(tables.length, 9, "存在预期外表，停止");
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runDatabaseCommand(async (db) =>
    console.log(JSON.stringify(await profileBoundary(db))),
  );
