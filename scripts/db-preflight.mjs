import { runDatabaseCommand } from "../database/connection.mjs";

await runDatabaseCommand(async (connection) => {
  const [[migrationCount], [studentCount], [userCount]] = await Promise.all([
    connection.query("SELECT COUNT(*) AS total FROM schema_migrations"),
    connection.query("SELECT COUNT(*) AS total FROM students"),
    connection.query("SELECT COUNT(*) AS total FROM users"),
  ]);

  console.log(
    `数据库预检通过：tutor_workspace；迁移 ${Number(migrationCount[0]?.total ?? 0)} 条；学生 ${Number(studentCount[0]?.total ?? 0)} 名；操作人 ${Number(userCount[0]?.total ?? 0)} 名。`,
  );
});
