import type { Connection } from "mysql2/promise";

export const APPROVED_DATABASE = "tutor_workspace";

export class DatabaseBoundaryError extends Error {
  constructor() {
    super("数据库范围校验未通过，操作已停止。");
    this.name = "DatabaseBoundaryError";
  }
}

/** S7 authorizes exactly this additive change, not general ALTER execution. */
export function parseStudentVersionMigration(sql: string): string[] {
  const statement = sql.trim().replace(/\s+/g, " ");
  if (
    statement !==
    "ALTER TABLE students ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT chk_students_version CHECK (version > 0);"
  )
    throw new Error("迁移超出已批准的学生版本字段范围。");
  return [statement.slice(0, -1)];
}

/** This slice authorizes only nullable student grades and the trial-contract state. */
export function parseExperienceStudentTrialMigration(sql: string): string[] {
  return parseExactMigration(
    sql,
    [
      "ALTER TABLE students MODIFY COLUMN grade VARCHAR(16) NULL, DROP CHECK chk_students_grade, ADD CONSTRAINT chk_students_grade CHECK ( grade IS NULL OR grade IN ('初一','初二','初三','高一','高二') )",
      "ALTER TABLE contracts ADD COLUMN trial_status VARCHAR(16) NULL AFTER contract_type, DROP CHECK chk_contracts_fields, ADD CONSTRAINT chk_contracts_fields CHECK ( (contract_type IN ('month','half_year','year') AND trial_status IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date AND attended_lessons IS NULL AND total_lessons IS NULL) OR (contract_type = 'lessons' AND trial_status IS NULL AND start_date IS NULL AND end_date IS NULL AND attended_lessons IS NOT NULL AND total_lessons IS NOT NULL AND total_lessons > 0 AND attended_lessons <= total_lessons) OR (contract_type = 'trial' AND trial_status IN ('active','terminated') AND start_date IS NULL AND end_date IS NULL AND attended_lessons IS NULL AND total_lessons IS NULL AND makeup_lessons = 0) ), ADD INDEX idx_contracts_student_trial_status (student_id, contract_type, trial_status, id)",
    ],
    "迁移超出已批准的体验学生与体验合同范围。",
  );
}

function parseExactMigration(
  sql: string,
  expectedStatements: readonly string[],
  message: string,
): string[] {
  if (/--|\/\*|#/.test(sql)) throw new Error(message);
  const statements = sql
    .split(";")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (
    statements.length !== expectedStatements.length ||
    statements.some(
      (statement, index) => statement !== expectedStatements[index],
    )
  )
    throw new Error(message);
  return statements;
}

/** S8.1 allows only the approved account table definition. */
export function parseAuthAccountsMigration(sql: string): string[] {
  return parseExactMigration(
    sql,
    [
      "CREATE TABLE user_accounts ( user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, role VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL, must_change_password TINYINT(1) NOT NULL DEFAULT 1, failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0, failed_window_started_at DATETIME(3) NULL, locked_until DATETIME(3) NULL, password_changed_at DATETIME(3) NOT NULL, last_login_at DATETIME(3) NULL, version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), CONSTRAINT fk_user_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT chk_user_accounts_role CHECK (role IN ('admin', 'advisor')), CONSTRAINT chk_user_accounts_status CHECK (status IN ('enabled', 'disabled')), CONSTRAINT chk_user_accounts_must_change_password CHECK (must_change_password IN (0, 1)), CONSTRAINT chk_user_accounts_version CHECK (version > 0), UNIQUE KEY uq_user_accounts_username (username), INDEX idx_user_accounts_status_role (status, role, user_id), INDEX idx_user_accounts_locked (locked_until, user_id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ],
    "迁移超出已批准的账号表结构范围。",
  );
}

/** S8.1 allows only the approved opaque-session table definition. */
export function parseAuthSessionsMigration(sql: string): string[] {
  return parseExactMigration(
    sql,
    [
      "CREATE TABLE auth_sessions ( id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, token_hash BINARY(32) NOT NULL, csrf_token_hash BINARY(32) NOT NULL, created_at DATETIME(3) NOT NULL, last_seen_at DATETIME(3) NOT NULL, idle_expires_at DATETIME(3) NOT NULL, absolute_expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL, revoke_reason VARCHAR(32) NULL, CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES user_accounts(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT chk_auth_sessions_expiry CHECK (idle_expires_at <= absolute_expires_at), CONSTRAINT chk_auth_sessions_revocation CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IN ('logout', 'password_reset', 'password_change', 'role_change', 'account_disabled'))), UNIQUE KEY uq_auth_sessions_token_hash (token_hash), INDEX idx_auth_sessions_user_active (user_id, revoked_at, absolute_expires_at, id), INDEX idx_auth_sessions_expiry (absolute_expires_at, id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ],
    "迁移超出已批准的会话表结构范围。",
  );
}

/** S8.1 allows only the approved audit table and student scope index. */
export function parseAuthorizationAuditMigration(sql: string): string[] {
  return parseExactMigration(
    sql,
    [
      "CREATE TABLE audit_logs ( id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_user_id BIGINT UNSIGNED NOT NULL, action VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, entity_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, entity_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NULL, before_json JSON NULL, after_json JSON NULL, metadata_json JSON NULL, occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT fk_audit_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT chk_audit_logs_entity_type CHECK (entity_type IN ('student', 'contract', 'learning_record', 'task', 'task_assignment', 'user_account')), CONSTRAINT chk_audit_logs_action CHECK (CHAR_LENGTH(action) BETWEEN 3 AND 64), INDEX idx_audit_logs_occurred (occurred_at, id), INDEX idx_audit_logs_actor_occurred (actor_user_id, occurred_at, id), INDEX idx_audit_logs_student_occurred (student_id, occurred_at, id), INDEX idx_audit_logs_entity_occurred (entity_type, entity_id, occurred_at, id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
      "ALTER TABLE students ADD INDEX idx_students_owner_status (owner_user_id, status, id)",
    ],
    "迁移超出已批准的审计与学生索引范围。",
  );
}

export async function assertApprovedDatabase(
  connection: Pick<Connection, "query">,
) {
  const [result] = await connection.query(
    "SELECT DATABASE() AS current_database",
  );
  const row = (result as Array<{ current_database: string | null }>)[0];
  if (row?.current_database !== APPROVED_DATABASE)
    throw new DatabaseBoundaryError();
}

/** Only the S1, unqualified CREATE TABLE statements are accepted. */
export function parseS1Migration(sql: string): string[] {
  return parseMigration(
    sql,
    ["schema_migrations", "users", "students"],
    ["users"],
  );
}

export function parseMigration(
  sql: string,
  tables: readonly string[],
  allowedReferences: readonly string[],
): string[] {
  if (/--|\/\*|#/.test(sql)) throw new Error("迁移文件不允许注释或隐藏语句。");
  const statements = sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!statements.length) throw new Error("迁移文件为空。");
  for (const statement of statements) {
    if (
      !tables.includes(
        /^CREATE TABLE (\w+)\s*\(/i.exec(statement)?.[1] ?? "",
      ) ||
      /\.|\b(USE|DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|SELECT|DATABASE|SCHEMA|LIKE|RENAME)\b/i.test(
        statement.replace(/ON (DELETE|UPDATE) RESTRICT/gi, ""),
      )
    ) {
      throw new Error("迁移超出已批准建表范围。");
    }
    const references = [...statement.matchAll(/REFERENCES\s+(\w+)/gi)];
    if (references.some((match) => !allowedReferences.includes(match[1]!)))
      throw new Error("迁移引用超出已批准范围。");
  }
  return statements;
}
