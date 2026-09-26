import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  CurrentUser,
  ResponsibleSubjectsUpdate,
} from "../../types/api/auth.ts";
import type { AuthContext } from "../auth/context.ts";
import { ApiError } from "../utils/api.ts";
import { writeAuditLog } from "./audit.ts";
import { positiveId, uint } from "./contracts-rules.ts";
import { requiredSubject } from "./subject-rules.ts";
import { executeWrite } from "./write.ts";

const maximumResponsibleSubjects = 10;

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}

export function normalizeResponsibleSubjects(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > maximumResponsibleSubjects)
    invalid("负责学科须为不超过10项的数组。");
  const subjects = value.map((item) => requiredSubject(item, "负责学科"));
  if (new Set(subjects).size !== subjects.length) invalid("负责学科不能重复。");
  return subjects;
}

export function parseResponsibleSubjectsUpdate(
  value: unknown,
): ResponsibleSubjectsUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("负责学科请求须为JSON对象。");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["subjects", "expectedVersion"].includes(key),
    )
  )
    invalid("请求含不可写字段。");
  return {
    subjects: normalizeResponsibleSubjects(input.subjects),
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}

export async function responsibleSubjectsForUser(
  connection: Connection,
  userId: string,
): Promise<string[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT subject FROM user_responsible_subjects WHERE user_id=? ORDER BY subject LIMIT 10",
    [positiveId(userId)],
  );
  return rows.map((row) => String(row.subject));
}

export async function currentUserProfile(
  connection: Connection,
  auth: Pick<
    AuthContext,
    "userId" | "username" | "name" | "role" | "mustChangePassword"
  >,
): Promise<CurrentUser> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT version,status FROM user_accounts WHERE user_id=? LIMIT 1",
    [positiveId(auth.userId)],
  );
  if (rows[0]?.status !== "enabled")
    throw new ApiError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
  return {
    id: auth.userId,
    username: auth.username,
    name: auth.name,
    role: auth.role,
    mustChangePassword: auth.mustChangePassword,
    responsibleSubjects: await responsibleSubjectsForUser(
      connection,
      auth.userId,
    ),
    version: Number(rows[0].version),
  };
}

function versionConflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "个人设置已被其他窗口修改，请保留当前选择并重新加载。",
  );
}

export async function replaceResponsibleSubjects(
  connection: Connection,
  actor: Pick<
    AuthContext,
    "userId" | "username" | "name" | "role" | "mustChangePassword"
  >,
  input: ResponsibleSubjectsUpdate,
): Promise<CurrentUser> {
  const [accounts] = await connection.execute<RowDataPacket[]>(
    "SELECT version,status FROM user_accounts WHERE user_id=? LIMIT 1 FOR UPDATE",
    [positiveId(actor.userId)],
  );
  const account = accounts[0];
  if (account?.status !== "enabled")
    throw new ApiError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
  const version = Number(account.version);
  if (version !== input.expectedVersion || version >= 4294967295)
    versionConflict();

  const before = await responsibleSubjectsForUser(connection, actor.userId);
  await executeWrite(
    connection,
    "DELETE FROM user_responsible_subjects WHERE user_id=?",
    [actor.userId],
  );
  if (input.subjects.length) {
    const slots = input.subjects.map(() => "(?,?)").join(",");
    await executeWrite(
      connection,
      "INSERT INTO user_responsible_subjects (user_id,subject) VALUES " + slots,
      input.subjects.flatMap((subject) => [actor.userId, subject]),
    );
  }
  const updated = await executeWrite(
    connection,
    "UPDATE user_accounts SET version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE user_id=? AND version=? AND status='enabled' AND version<4294967295",
    [actor.userId, version],
  );
  if (updated.affectedRows !== 1) versionConflict();
  await writeAuditLog(connection, {
    actorUserId: actor.userId,
    action: "user_account.responsible_subjects.update",
    entityType: "user_account",
    entityId: actor.userId,
    before: { subjects: before },
    after: { subjects: input.subjects },
  });
  return {
    id: actor.userId,
    username: actor.username,
    name: actor.name,
    role: actor.role,
    mustChangePassword: actor.mustChangePassword,
    responsibleSubjects: [...input.subjects].sort(),
    version: version + 1,
  };
}
