import { createPool, type Pool } from "mysql2/promise";

let pool: Pool | undefined;

/** Returns the shared MySQL pool. No connection is opened until it is used. */
export function getMysqlPool(): Pool {
  if (!pool) {
    const config = useRuntimeConfig();
    if (!config.mysql.host || !config.mysql.database || !config.mysql.user) {
      throw createError({
        statusCode: 500,
        statusMessage: "MySQL configuration is incomplete.",
      });
    }
    pool = createPool({
      host: config.mysql.host,
      port: Number(config.mysql.port),
      database: config.mysql.database,
      user: config.mysql.user,
      password: config.mysql.password,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    });
  }
  return pool;
}
