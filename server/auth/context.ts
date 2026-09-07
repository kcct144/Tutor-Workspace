import type { Connection, RowDataPacket } from "mysql2/promise";
import type { H3Event } from "h3";
import type { AccountRole } from "../db/auth-rules.ts";
import { positiveId } from "../db/contracts-rules.ts";
import { ApiError } from "../utils/api.ts";

export interface AuthContext {
  userId: string;
  name: string;
  username: string;
  role: AccountRole;
  mustChangePassword: boolean;
  sessionId: string;
}

type EventWithAuth = H3Event & {
  context: H3Event["context"] & { auth?: AuthContext };
};

export function currentAuth(event: H3Event): AuthContext {
  const auth = (event as EventWithAuth).context.auth;
  if (!auth)
    throw new ApiError(401, "UNAUTHENTICATED", "请先登录后再继续操作。");
  return auth;
}

/** Rechecks account status inside every existing business write transaction. */
export async function requireActiveAuth(
  connection: Connection,
  event: H3Event,
): Promise<AuthContext> {
  const auth = currentAuth(event);
  const [rows] = await connection.execute<
    Array<RowDataPacket & { role: AccountRole; status: string }>
  >(
    "SELECT role,status FROM user_accounts WHERE user_id=? LIMIT 1 FOR UPDATE",
    [positiveId(auth.userId)],
  );
  if (rows[0]?.status !== "enabled")
    throw new ApiError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
  return { ...auth, role: rows[0].role };
}
