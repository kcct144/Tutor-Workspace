import assert from "node:assert/strict";
import { runDatabaseCommand } from "../../database/connection.mjs";

// Deliberately local HTTP only; database credentials stay inside connection.mjs.
const base = new URL(process.env.S1_API_BASE_URL || "http://127.0.0.1:3000");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
  base.protocol !== "http:"
) {
  throw new Error("接口测试仅允许本机开发服务器。");
}
await runDatabaseCommand(async (connection) => {
  const [migrations] = await connection.query(
    "SELECT version FROM schema_migrations ORDER BY version LIMIT 3",
  );
  assert.deepEqual(
    migrations.map((row) => row.version),
    ["000_schema_migrations", "001_students"],
  );
  const [indexes] = await connection.query("SHOW INDEX FROM students");
  const indexNames = new Set(indexes.map((row) => row.Key_name));
  for (const name of [
    "PRIMARY",
    "idx_students_grade_status",
    "idx_students_owner",
  ])
    assert.ok(indexNames.has(name));
  const [ddlRows] = await connection.query("SHOW CREATE TABLE students");
  const ddl = ddlRows[0]["Create Table"];
  for (const name of [
    "fk_students_owner",
    "chk_students_name",
    "chk_students_grade",
    "chk_students_gender",
    "chk_students_status",
  ])
    assert.ok(ddl.includes(name));
  // Inspect approved schema in memory; do not print DDL, rows or connection values.
  async function get(path, expected = 200) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, expected);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.json();
    assert.equal(body.status, expected === 200 ? "ok" : "error");
    assert.deepEqual(Object.keys(body).sort(), ["data", "msg", "status"]);
    return body.data;
  }
  const [counts] = await connection.query(
    "SELECT COUNT(*) AS total FROM students",
  );
  const first = await get("/api/students/list?page=1&pageSize=8");
  assert.equal(first.total, Number(counts[0].total));
  assert.equal(first.items.length, Math.min(8, first.total));
  const second = await get("/api/students/list?page=2&pageSize=8");
  assert.equal(second.page, 2);
  assert.equal(
    second.items.some((row) => first.items.some((item) => item.id === row.id)),
    false,
  );
  const far = await get("/api/students/list?page=1000000000&pageSize=100");
  assert.equal(far.items.length, 0);
  for (const suffix of [
    "page=0",
    "pageSize=101",
    "grade=unknown",
    "status=unknown",
    "actorId=1",
    "keyword=a&keyword=b",
  ])
    await get("/api/students/list?" + suffix, 400);
  await get("/api/students/detail?id=0", 400);
  const [maximum] = await connection.query(
    "SELECT MAX(id) AS max_id FROM students",
  );
  const missing = (BigInt(maximum[0].max_id ?? 0) + 1n).toString();
  await get("/api/students/detail?id=" + missing, 404);
  const options = await get("/api/students/options?pageSize=1");
  if (options.items[0])
    assert.deepEqual(Object.keys(options.items[0]).sort(), [
      "grade",
      "id",
      "name",
    ]);
  if (first.items[0]) {
    const item = first.items[0];
    const detail = await get("/api/students/detail?id=" + item.id);
    assert.equal(detail.id, item.id);
    assert.deepEqual(
      Object.keys(detail).sort(),
      [
        "id",
        "name",
        "grade",
        "className",
        "school",
        "status",
        "subjects",
        "plans",
        "expiryDate",
        "lastFollowUp",
        "gender",
        "enrolledAt",
        "createdAt",
        "guardianName",
        "guardianPhone",
        "note",
        "owner",
      ].sort(),
    );
    const filtered = await get(
      "/api/students/list?" +
        new URLSearchParams({
          grade: item.grade,
          status: item.status,
          keyword: item.name,
        }),
    );
    assert.ok(filtered.items.some((row) => row.id === item.id));
    assert.ok(
      filtered.items.every(
        (row) =>
          row.grade === item.grade &&
          row.status === item.status &&
          row.name.includes(item.name),
      ),
    );
    assert.equal("guardianPhone" in item, false);
    assert.equal("owner_user_id" in item, false);
  }
  const literal = await get(
    "/api/students/list?" + new URLSearchParams({ keyword: "%' OR 1=1_!" }),
  );
  assert.equal(literal.total, 0);
  console.log(
    "S1真实API通过：分页、筛选、选择器、详情、无效参数、不存在ID及安全字段投影；未写入测试数据。",
  );
});
