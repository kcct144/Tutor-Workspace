import type { Connection, RowDataPacket } from "mysql2/promise";
import { ApiError } from "../utils/api.ts";
import { positiveId } from "./contracts-rules.ts";

export async function requireDevActor(
  connection: Connection,
  value: unknown,
): Promise<string> {
  const unavailable = () =>
    new ApiError(
      503,
      "DEV_ACTOR_UNAVAILABLE",
      "开发操作人未配置或无效，请在本机配置DEV_ACTOR_ID后重试。",
    );
  let id: string;
  try {
    id = positiveId(value);
  } catch {
    throw unavailable();
  }
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  if (!rows.length) throw unavailable();
  return id;
}
