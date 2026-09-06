import { createPool, type Pool, type PoolConnection } from "mysql2/promise";
import { mysqlOptions, type MysqlSettings } from "./config.ts";
import { assertApprovedDatabase } from "./safety.ts";

let pool: Pool | undefined;
export function getMysqlPool(settings: MysqlSettings): Pool {
  pool ??= createPool({
    ...mysqlOptions(settings),
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 20,
    enableKeepAlive: true,
  });
  return pool;
}

export async function withDatabase<T>(
  settings: MysqlSettings,
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await getMysqlPool(settings).getConnection();
  try {
    await assertApprovedDatabase(connection);
    await connection.query("SET time_zone = '+00:00'");
    return await work(connection);
  } finally {
    connection.release();
  }
}

export async function inTransaction<T>(
  connection: PoolConnection,
  work: () => Promise<T>,
): Promise<T> {
  await assertApprovedDatabase(connection);
  await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.beginTransaction();
  try {
    const result = await work();
    await assertApprovedDatabase(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function closeMysqlPool() {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
