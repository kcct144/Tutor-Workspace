import { runDatabaseCommand } from "../database/connection.mjs";
import { assertApprovedDatabase } from "../server/db/safety.ts";

await runDatabaseCommand(async (connection) => {
  if (
    process.argv
      .slice(2)
      .some((arg) => !["--json", "--require-actor"].includes(arg))
  )
    throw new Error("预检参数无效");
  await assertApprovedDatabase(connection);
  const [[migrationCount], [studentCount], [userCount]] = await Promise.all([
    connection.query({
      sql: "SELECT COUNT(*) AS total FROM schema_migrations LIMIT 1",
      timeout: 10000,
    }),
    connection.query({
      sql: "SELECT COUNT(*) AS total FROM students LIMIT 1",
      timeout: 10000,
    }),
    connection.query({
      sql: "SELECT COUNT(*) AS total FROM users LIMIT 1",
      timeout: 10000,
    }),
  ]);
  const actor = process.env.DEV_ACTOR_ID;
  let actorReady = false;
  if (
    typeof actor === "string" &&
    /^[1-9]\d{0,19}$/.test(actor) &&
    BigInt(actor) <= 18446744073709551615n
  ) {
    const [rows] = await connection.execute(
      { sql: "SELECT id FROM users WHERE id=? LIMIT 1", timeout: 10000 },
      [actor],
    );
    actorReady = rows.length === 1;
  }
  const result = {
    databaseApproved: true,
    migrations: Number(migrationCount[0]?.total ?? 0),
    students: Number(studentCount[0]?.total ?? 0),
    users: Number(userCount[0]?.total ?? 0),
    actorReady,
  };
  console.log(
    process.argv.includes("--json")
      ? JSON.stringify(result)
      : `数据库预检通过：tutor_workspace；迁移 ${result.migrations} 条；学生 ${result.students} 名；操作人 ${result.users} 名；服务端操作人可用：${actorReady ? "是" : "否（禁止写入）"}。`,
  );
  if (process.argv.includes("--require-actor") && !actorReady)
    throw new Error("操作人不可用");
});
