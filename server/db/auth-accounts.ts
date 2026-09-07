import type { Connection, RowDataPacket } from "mysql2/promise";
import { assertApprovedDatabase } from "./safety.ts";
import {
  isSupportedPasswordHash,
  normalizeUserName,
  normalizeUsername,
  verifyPassword,
  type AccountRole,
} from "./auth-rules.ts";
import { positiveId } from "./contracts-rules.ts";
import { writeAuditLog } from "./audit.ts";
import { executeWrite } from "./write.ts";
import { ApiError } from "../utils/api.ts";

const bootstrapLock = "tutor_workspace:auth:bootstrap-admin";

export interface InitialAdminInspection {
  userCount: number;
  enabledAdminCount: number;
}

export interface BootstrapInitialAdminInput {
  existingUserId?: string;
  newUserName?: string;
  username: string;
  passwordHash: string;
}

export interface BootstrapInitialAdminResult {
  createdUser: boolean;
}

export interface AuthenticatedAccount {
  userId: string;
  name: string;
  username: string;
  role: AccountRole;
  mustChangePassword: boolean;
}

const genericLoginError = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "账号或密码错误。");

function loginObject(value: unknown): { username: string; password: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "VALIDATION_ERROR", "登录请求格式无效。");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, "username") ||
    !Object.hasOwn(input, "password") ||
    typeof input.username !== "string" ||
    typeof input.password !== "string" ||
    Buffer.byteLength(input.password, "utf8") > 512
  )
    throw new ApiError(400, "VALIDATION_ERROR", "登录请求格式无效。");
  return { username: input.username, password: input.password };
}

async function genericPasswordWork(password: string): Promise<void> {
  // A fixed non-secret Argon2id hash equalizes an absent-account path.
  const dummyHash =
    "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await verifyPassword(password, dummyHash);
}

/** Authenticates with a bounded database lockout counter without exposing cause. */
export async function authenticateAccount(
  connection: Connection,
  value: unknown,
  afterAuthenticated?: (account: AuthenticatedAccount) => Promise<void>,
): Promise<AuthenticatedAccount> {
  const input = loginObject(value);
  let username: string;
  try {
    username = normalizeUsername(input.username);
  } catch {
    await genericPasswordWork(input.password);
    throw genericLoginError();
  }
  await assertApprovedDatabase(connection);
  await connection.beginTransaction();
  try {
    await assertApprovedDatabase(connection);
    const [rows] = await connection.execute<
      Array<
        RowDataPacket & {
          user_id: string;
          name: string;
          username: string;
          password_hash: string;
          role: AccountRole;
          status: string;
          must_change_password: number;
          failed_login_count: number;
          failed_window_started_at: string | null;
          locked_until: string | null;
          is_locked: number;
          in_failure_window: number;
        }
      >
    >(
      "SELECT a.user_id,u.name,a.username,a.password_hash,a.role,a.status,a.must_change_password,a.failed_login_count,a.failed_window_started_at,a.locked_until,(a.locked_until>UTC_TIMESTAMP(3)) AS is_locked,(a.failed_window_started_at>=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) AS in_failure_window FROM user_accounts a INNER JOIN users u ON u.id=a.user_id WHERE a.username=? LIMIT 1 FOR UPDATE",
      [username],
    );
    const account = rows[0];
    const passwordMatches = account
      ? await verifyPassword(input.password, account.password_hash)
      : (await genericPasswordWork(input.password), false);
    if (
      !account ||
      !passwordMatches ||
      account.status !== "enabled" ||
      Number(account.is_locked) === 1
    ) {
      if (
        account &&
        account.status === "enabled" &&
        !Number(account.is_locked)
      ) {
        const failures = Number(account.in_failure_window)
          ? Number(account.failed_login_count) + 1
          : 1;
        await executeWrite(
          connection,
          "UPDATE user_accounts SET failed_login_count=?,failed_window_started_at=IF(?,failed_window_started_at,UTC_TIMESTAMP(3)),locked_until=IF(? >= 5,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),NULL) WHERE user_id=?",
          [
            failures,
            Number(account.in_failure_window),
            failures,
            String(account.user_id),
          ],
        );
      }
      await connection.commit();
      throw genericLoginError();
    }
    await executeWrite(
      connection,
      "UPDATE user_accounts SET failed_login_count=0,failed_window_started_at=NULL,locked_until=NULL,last_login_at=UTC_TIMESTAMP(3) WHERE user_id=?",
      [String(account.user_id)],
    );
    const authenticated: AuthenticatedAccount = {
      userId: String(account.user_id),
      name: account.name,
      username: account.username,
      role: account.role,
      mustChangePassword: Number(account.must_change_password) === 1,
    };
    await afterAuthenticated?.(authenticated);
    await assertApprovedDatabase(connection);
    await connection.commit();
    return authenticated;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  }
}

export async function inspectInitialAdmin(
  connection: Connection,
): Promise<InitialAdminInspection> {
  await assertApprovedDatabase(connection);
  const [userRows] = await connection.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM users LIMIT 1",
  );
  const [adminRows] = await connection.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM user_accounts WHERE role='admin' AND status='enabled' LIMIT 1",
  );
  return {
    userCount: Number(userRows[0]?.total ?? 0),
    enabledAdminCount: Number(adminRows[0]?.total ?? 0),
  };
}

function parseBootstrapInput(input: BootstrapInitialAdminInput) {
  const username = normalizeUsername(input.username);
  if (!isSupportedPasswordHash(input.passwordHash))
    throw new Error("密码哈希格式无效。");
  const hasExisting = input.existingUserId !== undefined;
  const hasNew = input.newUserName !== undefined;
  if (hasExisting === hasNew) throw new Error("初始管理员人员选择无效。");
  return {
    username,
    passwordHash: input.passwordHash,
    existingUserId: hasExisting ? positiveId(input.existingUserId) : undefined,
    newUserName: hasNew ? normalizeUserName(input.newUserName) : undefined,
  };
}

async function enabledAdministratorCount(
  connection: Connection,
): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM user_accounts WHERE role='admin' AND status='enabled' FOR UPDATE",
  );
  return Number(rows[0]?.total ?? 0);
}

export async function bootstrapInitialAdmin(
  connection: Connection,
  input: BootstrapInitialAdminInput,
): Promise<BootstrapInitialAdminResult> {
  const parsed = parseBootstrapInput(input);
  await assertApprovedDatabase(connection);
  const [lockRows] = await connection.execute<RowDataPacket[]>(
    "SELECT GET_LOCK(?, 0) AS acquired",
    [bootstrapLock],
  );
  if (Number(lockRows[0]?.acquired) !== 1)
    throw new Error("未取得初始管理员引导锁；未写入。");
  try {
    await connection.beginTransaction();
    try {
      await assertApprovedDatabase(connection);
      if ((await enabledAdministratorCount(connection)) > 0)
        throw new Error("已存在启用管理员；未写入。");
      let userId = parsed.existingUserId;
      let createdUser = false;
      if (userId) {
        const [users] = await connection.execute<RowDataPacket[]>(
          "SELECT id FROM users WHERE id=? LIMIT 1 FOR UPDATE",
          [userId],
        );
        if (!users.length) throw new Error("指定人员不存在；未写入。");
      } else {
        const result = await executeWrite(
          connection,
          "INSERT INTO users (name) VALUES (?)",
          [parsed.newUserName!],
        );
        userId = String(result.insertId);
        createdUser = true;
      }
      const [accounts] = await connection.execute<RowDataPacket[]>(
        "SELECT user_id FROM user_accounts WHERE user_id=? LIMIT 1 FOR UPDATE",
        [userId],
      );
      if (accounts.length) throw new Error("指定人员已有登录账号；未写入。");
      await executeWrite(
        connection,
        "INSERT INTO user_accounts (user_id,username,password_hash,role,status,must_change_password,password_changed_at) VALUES (?,?,?,'admin','enabled',0,UTC_TIMESTAMP(3))",
        [userId, parsed.username, parsed.passwordHash],
      );
      await writeAuditLog(connection, {
        actorUserId: userId,
        action: "user_account.bootstrap_admin",
        entityType: "user_account",
        entityId: userId,
        after: { role: "admin", status: "enabled", mustChange: false },
        metadata: { bootstrap: true },
      });
      await assertApprovedDatabase(connection);
      await connection.commit();
      return { createdUser };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    }
  } finally {
    await connection
      .execute("SELECT RELEASE_LOCK(?)", [bootstrapLock])
      .catch(() => {});
  }
}
