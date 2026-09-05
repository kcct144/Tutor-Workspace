import { loadEnvFile } from "node:process";
import { createConnection } from "mysql2/promise";
import { mysqlOptions } from "../server/db/config.ts";
import { assertApprovedDatabase } from "../server/db/safety.ts";

export async function openDatabase() {
  // Runtime loading only. Never print environment values or driver exceptions.
  try {
    loadEnvFile(".env");
  } catch {
    throw new Error("无法加载本地环境文件。");
  }
  const connection = await createConnection(
    mysqlOptions({
      host: process.env.NUXT_MYSQL_HOST ?? "",
      port: process.env.NUXT_MYSQL_PORT ?? "3306",
      database: process.env.NUXT_MYSQL_DATABASE ?? "",
      user: process.env.NUXT_MYSQL_USER ?? "",
      password: process.env.NUXT_MYSQL_PASSWORD ?? "",
      ssl: process.env.NUXT_MYSQL_SSL ?? "",
    }),
  );
  try {
    await assertApprovedDatabase(connection);
    await connection.query("SET time_zone = '+00:00'");
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

export async function runDatabaseCommand(action) {
  let connection;
  try {
    connection = await openDatabase();
    console.log("数据库边界校验通过。");
    await action(connection);
  } catch {
    console.error(
      "操作已停止。请在本机检查目标库、连接权限、迁移状态或数据前置条件；未输出任何真实配置或驱动错误。",
    );
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
