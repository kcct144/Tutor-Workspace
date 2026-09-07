import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../../database/connection.mjs";
import { writeAuditLog } from "../../server/db/audit.ts";
import { createAuthSession } from "../../server/db/auth-sessions.ts";
import { assertApprovedDatabase } from "../../server/db/safety.ts";

const passwordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function expectDatabaseReject(work, label) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error(`${label}未被数据库拒绝。`);
}

async function tableCounts(connection) {
  const [rows] = await connection.query(
    "SELECT (SELECT COUNT(*) FROM users) AS users_total,(SELECT COUNT(*) FROM user_accounts) AS accounts_total,(SELECT COUNT(*) FROM auth_sessions) AS sessions_total,(SELECT COUNT(*) FROM audit_logs) AS audit_total",
  );
  return rows[0];
}

async function executeWrite(connection, sql, values) {
  await assertApprovedDatabase(connection);
  return await connection.execute(sql, values);
}

const connection = await openDatabase();
try {
  await assertApprovedDatabase(connection);
  const [migrations] = await connection.execute(
    "SELECT version FROM schema_migrations WHERE version IN (?,?,?) ORDER BY version LIMIT 3",
    ["008_auth_accounts", "009_auth_sessions", "010_authorization_audit"],
  );
  assert.equal(migrations.length, 3, "S8.1迁移登记不完整。");
  const before = await tableCounts(connection);
  await connection.beginTransaction();
  try {
    await assertApprovedDatabase(connection);
    const [person] = await executeWrite(
      connection,
      "INSERT INTO users (name) VALUES (?)",
      ["S8事务校验人员"],
    );
    const userId = String(person.insertId);
    await expectDatabaseReject(
      () =>
        executeWrite(
          connection,
          "INSERT INTO user_accounts (user_id,username,password_hash,role,status,must_change_password,password_changed_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))",
          [userId, "s8.invalid", passwordHash, "invalid", "enabled", 0],
        ),
      "账号角色约束",
    );
    await executeWrite(
      connection,
      "INSERT INTO user_accounts (user_id,username,password_hash,role,status,must_change_password,password_changed_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))",
      [userId, "s8.foundation", passwordHash, "admin", "enabled", 0],
    );
    await expectDatabaseReject(
      () =>
        executeWrite(
          connection,
          "INSERT INTO auth_sessions (user_id,token_hash,csrf_token_hash,created_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES (?,UNHEX(SHA2('bad-session',256)),UNHEX(SHA2('bad-csrf',256)),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),'2026-09-08 00:00:00.000','2026-09-07 00:00:00.000')",
          [userId],
        ),
      "会话期限约束",
    );
    const sessionId = await createAuthSession(connection, {
      userId,
      tokenHash: Buffer.alloc(32, 1),
      csrfTokenHash: Buffer.alloc(32, 2),
      createdAt: "2026-09-07 00:00:00.000",
      idleExpiresAt: "2026-09-07 08:00:00.000",
      absoluteExpiresAt: "2026-09-14 00:00:00.000",
    });
    assert.match(sessionId, /^\d+$/u);
    await expectDatabaseReject(
      () =>
        createAuthSession(connection, {
          userId,
          tokenHash: Buffer.alloc(32, 1),
          csrfTokenHash: Buffer.alloc(32, 3),
          createdAt: "2026-09-07 00:00:00.000",
          idleExpiresAt: "2026-09-07 08:00:00.000",
          absoluteExpiresAt: "2026-09-14 00:00:00.000",
        }),
      "会话摘要唯一约束",
    );
    const auditId = await writeAuditLog(connection, {
      requestId: randomUUID(),
      actorUserId: userId,
      action: "user_account.integration_check",
      entityType: "user_account",
      entityId: userId,
      after: { role: "admin", status: "enabled" },
      metadata: { transactionCheck: true },
    });
    assert.match(auditId, /^\d+$/u);
    await assert.rejects(() =>
      writeAuditLog(connection, {
        actorUserId: userId,
        action: "student.update",
        entityType: "student",
        entityId: userId,
        after: { content: "不得写入" },
      }),
    );
  } finally {
    await connection.rollback();
  }
  await assertApprovedDatabase(connection);
  assert.deepEqual(await tableCounts(connection), before);
  console.log(
    "S8.1真实数据库约束与事务回滚验证通过；未保留账号、会话、审计或人员数据。",
  );
} finally {
  await connection.end();
}
