import type { Connection, ResultSetHeader } from "mysql2/promise";
import { assertApprovedDatabase } from "./safety.ts";

export async function executeWrite(
  connection: Connection,
  sql: string,
  values: (string | number | null)[],
) {
  await assertApprovedDatabase(connection);
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return result;
}
