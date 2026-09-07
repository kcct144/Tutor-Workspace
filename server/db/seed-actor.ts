import type { Connection, RowDataPacket } from "mysql2/promise";

/** Resolve the one enabled administrator required by explicit development seeds. */
export async function resolveSeedAdministrator(
  connection: Connection,
): Promise<string> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT user_id FROM user_accounts WHERE role='admin' AND status='enabled' ORDER BY user_id LIMIT 2",
  );
  if (rows.length !== 1) throw new Error("显式种子要求恰有一名启用管理员。");
  return String(rows[0]!.user_id);
}
