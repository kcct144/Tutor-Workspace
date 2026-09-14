import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runDatabaseCommand } from "./connection.mjs";
import {
  assertApprovedDatabase,
  parseAuthAccountsMigration,
  parseAuthSessionsMigration,
  parseAuthorizationAuditMigration,
  parseMigration,
  parseStudentVersionMigration,
  parseExperienceStudentTrialMigration,
  parseLearningRecordSubjectMigration,
  parseScoreRecordsMigration,
  parseAuditScoreRecordMigration,
  parseAttendanceRecordsMigration,
  parseAuditAttendanceRecordMigration,
  parseExpandedStudentGradesMigration,
  parseTaskPlanProgressMigration,
} from "../server/db/safety.ts";
import { checkStudentVersion } from "./student-version.mjs";

const manifest = [
  // Ordered, explicit migrations only.
  {
    version: "000_schema_migrations",
    tables: ["schema_migrations"],
    references: [],
  },
  {
    version: "001_students",
    tables: ["users", "students"],
    references: ["users"],
  },
  {
    version: "002_contracts",
    tables: ["contracts"],
    references: ["users", "students"],
  },
  {
    version: "003_learning_records",
    tables: ["student_learning_records"],
    references: ["users", "students"],
  },
  {
    version: "004_study_plans",
    tables: ["study_plan_documents", "study_plan_students"],
    references: ["users", "students", "study_plan_documents"],
  },
  { version: "005_tasks", tables: ["tasks"], references: ["users"] },
  {
    version: "006_task_assignments",
    tables: ["task_assignments"],
    references: ["tasks", "students", "users"],
  },
  { version: "007_students_version", tables: [], references: [] },
  { version: "008_auth_accounts", tables: ["user_accounts"], references: [] },
  { version: "009_auth_sessions", tables: ["auth_sessions"], references: [] },
  {
    version: "010_authorization_audit",
    tables: ["audit_logs"],
    references: [],
  },
  {
    version: "011_experience_students_trial_contracts",
    tables: [],
    references: [],
  },
  { version: "012_learning_record_subject", tables: [], references: [] },
  {
    version: "013_score_records",
    tables: ["score_records"],
    references: ["students", "users"],
  },
  { version: "014_audit_score_record", tables: [], references: [] },
  {
    version: "015_attendance_records",
    tables: ["attendance_records"],
    references: ["students", "users"],
  },
  { version: "016_audit_attendance_record", tables: [], references: [] },
  { version: "017_expand_student_grades", tables: [], references: [] },
  { version: "018_task_plan_progress", tables: [], references: [] },
  {
    version: "019_student_tags",
    tables: ["student_tags"],
    references: ["students"],
  },
];

function parseApprovedMigration(version, sql, tables, references) {
  if (version === "007_students_version")
    return parseStudentVersionMigration(sql);
  if (version === "008_auth_accounts") return parseAuthAccountsMigration(sql);
  if (version === "009_auth_sessions") return parseAuthSessionsMigration(sql);
  if (version === "010_authorization_audit")
    return parseAuthorizationAuditMigration(sql);
  if (version === "011_experience_students_trial_contracts")
    return parseExperienceStudentTrialMigration(sql);
  if (version === "012_learning_record_subject")
    return parseLearningRecordSubjectMigration(sql);
  if (version === "013_score_records") return parseScoreRecordsMigration(sql);
  if (version === "014_audit_score_record")
    return parseAuditScoreRecordMigration(sql);
  if (version === "015_attendance_records")
    return parseAttendanceRecordsMigration(sql);
  if (version === "016_audit_attendance_record")
    return parseAuditAttendanceRecordMigration(sql);
  if (version === "017_expand_student_grades")
    return parseExpandedStudentGradesMigration(sql);
  if (version === "018_task_plan_progress")
    return parseTaskPlanProgressMigration(sql);
  return parseMigration(sql, tables, references);
}

async function checkAuthorizationAuditIndex(connection, applied) {
  await assertApprovedDatabase(connection);
  const [rows] = await connection.execute(
    "SELECT SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX LIMIT 4",
    ["students", "idx_students_owner_status"],
  );
  const columns = rows.map((row) => String(row.COLUMN_NAME));
  const expected = ["owner_user_id", "status", "id"];
  if (!applied) {
    if (columns.length)
      throw new Error("发现未登记的学生权限索引，停止人工核对。");
    return;
  }
  if (
    columns.length !== expected.length ||
    columns.some((column, index) => column !== expected[index])
  )
    throw new Error("学生权限索引不符合批准定义。");
}
async function checkExperienceTrialStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [rows] = await connection.execute(
    "SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='students' AND COLUMN_NAME='grade') OR (TABLE_NAME='contracts' AND COLUMN_NAME='trial_status')) ORDER BY TABLE_NAME,COLUMN_NAME LIMIT 2",
  );
  const grade = rows.find(
    (row) => row.TABLE_NAME === "students" && row.COLUMN_NAME === "grade",
  );
  const trial = rows.find(
    (row) =>
      row.TABLE_NAME === "contracts" && row.COLUMN_NAME === "trial_status",
  );
  const [indexRows] = await connection.execute(
    "SELECT SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contracts' AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX LIMIT 4",
    ["idx_contracts_student_trial_status"],
  );
  const expectedIndex = ["student_id", "contract_type", "trial_status", "id"];
  const indexColumns = indexRows.map((row) => String(row.COLUMN_NAME));
  if (!applied) {
    if (!grade || grade.IS_NULLABLE !== "NO" || trial || indexColumns.length)
      throw new Error("发现未登记的体验学生或体验合同DDL，停止人工核对。");
    return;
  }
  if (
    !grade ||
    grade.IS_NULLABLE !== "YES" ||
    !trial ||
    trial.IS_NULLABLE !== "YES" ||
    indexColumns.length !== expectedIndex.length ||
    indexColumns.some((column, index) => column !== expectedIndex[index])
  )
    throw new Error("体验学生或体验合同结构不符合批准定义。");
}
async function checkLearningRecordSubjectStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [columns] = await connection.execute(
    "SELECT IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    ["student_learning_records", "subject"],
  );
  const [checks] = await connection.execute(
    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='CHECK' LIMIT 1",
    ["student_learning_records", "chk_records_subject"],
  );
  const [indexes] = await connection.execute(
    "SELECT SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX LIMIT 4",
    ["student_learning_records", "idx_records_student_subject_date"],
  );
  const indexColumns = indexes.map((row) => String(row.COLUMN_NAME));
  const expectedIndex = ["student_id", "subject", "occurred_on", "id"];
  if (!applied) {
    if (columns.length || checks.length || indexColumns.length)
      throw new Error("发现未登记的学习记录科目DDL，停止人工核对。");
    return;
  }
  if (
    columns[0]?.IS_NULLABLE !== "YES" ||
    Number(columns[0]?.CHARACTER_MAXIMUM_LENGTH) !== 64 ||
    !checks.length ||
    indexColumns.length !== expectedIndex.length ||
    indexColumns.some((column, index) => column !== expectedIndex[index])
  )
    throw new Error("学习记录科目结构不符合批准定义。");
}
async function checkScoreRecordsStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION LIMIT 20",
    ["score_records"],
  );
  const [indexes] = await connection.execute(
    "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME LIMIT 10",
    ["score_records"],
  );
  const names = new Set(columns.map((row) => String(row.COLUMN_NAME)));
  const indexNames = new Set(indexes.map((row) => String(row.INDEX_NAME)));
  const expected = [
    "id",
    "student_id",
    "exam_date",
    "subject",
    "record_type",
    "exam_name",
    "score",
    "full_score",
    "created_by",
    "updated_by",
    "version",
    "created_at",
    "updated_at",
  ];
  if (!applied) {
    if (columns.length || indexes.length)
      throw new Error("发现未登记的成绩记录DDL，停止人工核对。");
    return;
  }
  if (
    expected.some((column) => !names.has(column)) ||
    !indexNames.has("idx_score_records_student_date") ||
    !indexNames.has("idx_score_records_student_subject_date") ||
    !indexNames.has("idx_score_records_subject_type_date") ||
    !indexNames.has("idx_score_records_updated")
  )
    throw new Error("成绩记录结构不符合批准定义。");
}
async function checkScoreRecordAuditStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [rows] = await connection.execute(
    "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=? LIMIT 1",
    ["chk_audit_logs_entity_type"],
  );
  const clause = String(rows[0]?.CHECK_CLAUSE ?? "");
  if (!rows.length || (applied && !clause.includes("score_record")))
    throw new Error("成绩审计对象约束不符合批准定义。");
  if (!applied && clause.includes("score_record"))
    throw new Error("发现未登记的成绩审计DDL，停止人工核对。");
}
async function checkAttendanceRecordsStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION LIMIT 20",
    ["attendance_records"],
  );
  const [indexes] = await connection.execute(
    "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME LIMIT 10",
    ["attendance_records"],
  );
  const names = new Set(columns.map((row) => String(row.COLUMN_NAME)));
  const indexNames = new Set(indexes.map((row) => String(row.INDEX_NAME)));
  const expected = [
    "id",
    "student_id",
    "attendance_date",
    "period",
    "status",
    "created_by",
    "updated_by",
    "version",
    "created_at",
    "updated_at",
  ];
  if (!applied) {
    if (columns.length || indexes.length)
      throw new Error("发现未登记的出勤记录DDL，停止人工核对。");
    return;
  }
  if (
    expected.some((column) => !names.has(column)) ||
    !indexNames.has("uq_attendance_student_date_period") ||
    !indexNames.has("idx_attendance_month_period_status") ||
    !indexNames.has("idx_attendance_student_date") ||
    !indexNames.has("idx_attendance_updated")
  )
    throw new Error("出勤记录结构不符合批准定义。");
}
async function checkAttendanceAuditStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [rows] = await connection.execute(
    "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=? LIMIT 1",
    ["chk_audit_logs_entity_type"],
  );
  const clause = String(rows[0]?.CHECK_CLAUSE ?? "");
  if (!rows.length || (applied && !clause.includes("attendance_record")))
    throw new Error("出勤审计对象约束不符合批准定义。");
  if (!applied && clause.includes("attendance_record"))
    throw new Error("发现未登记的出勤审计DDL，停止人工核对。");
}
async function checkExpandedStudentGradesStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [rows] = await connection.execute(
    "SELECT LENGTH(CHECK_CLAUSE)-LENGTH(REPLACE(CHECK_CLAUSE, ',', '')) AS grade_separator_count FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=? LIMIT 1",
    ["chk_students_grade"],
  );
  const separatorCount = Number(rows[0]?.grade_separator_count ?? -1);
  if (!applied) {
    if (separatorCount === 4) return false;
    if (separatorCount === 9) return true;
    throw new Error("发现未登记的学生年级DDL，停止人工核对。");
  }
  if (!rows.length || separatorCount !== 9)
    throw new Error("学生年级约束不符合批准定义。");
  return false;
}
async function checkTaskPlanProgressStructure(connection, applied) {
  await assertApprovedDatabase(connection);
  const [columns] = await connection.execute(
    "SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='tasks' AND COLUMN_NAME='study_plan_id') OR (TABLE_NAME='task_assignments' AND COLUMN_NAME='study_plan_id_snapshot')) ORDER BY TABLE_NAME,COLUMN_NAME LIMIT 2",
  );
  const [indexes] = await connection.execute(
    "SELECT TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='tasks' AND INDEX_NAME='idx_tasks_study_plan_status_updated') OR (TABLE_NAME='task_assignments' AND INDEX_NAME='idx_assignments_plan_student_status')) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX LIMIT 8",
  );
  const [foreignKeys] = await connection.execute(
    "SELECT TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('fk_tasks_study_plan','fk_assignments_study_plan_snapshot') ORDER BY CONSTRAINT_NAME LIMIT 2",
  );
  const expectedIndexes = new Map([
    [
      "task_assignments:idx_assignments_plan_student_status",
      "study_plan_id_snapshot,student_id,status,id",
    ],
    [
      "tasks:idx_tasks_study_plan_status_updated",
      "study_plan_id,status,updated_at,id",
    ],
  ]);
  const actualIndexes = new Map();
  for (const row of indexes) {
    const key = String(row.TABLE_NAME) + ":" + String(row.INDEX_NAME);
    actualIndexes.set(
      key,
      (actualIndexes.get(key) ?? []).concat(String(row.COLUMN_NAME)),
    );
  }
  const complete =
    columns.length === 2 &&
    columns.every((row) => row.IS_NULLABLE === "YES") &&
    [...expectedIndexes].every(
      ([key, value]) => (actualIndexes.get(key) ?? []).join(",") === value,
    ) &&
    foreignKeys.length === 2 &&
    foreignKeys.every(
      (row) => row.REFERENCED_TABLE_NAME === "study_plan_documents",
    );
  if (!applied) {
    if (columns.length || indexes.length || foreignKeys.length)
      throw new Error("发现未登记的任务计划关联DDL，停止人工核对。");
    return;
  }
  if (!complete) throw new Error("任务计划关联结构不符合批准定义。");
}
await runDatabaseCommand(async (connection) => {
  const [versionRows] = await connection.query("SELECT VERSION() AS version");
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(versionRows[0].version);
  if (
    !match ||
    /MariaDB/i.test(versionRows[0].version) ||
    Number(match[1]) < 8 ||
    (Number(match[1]) === 8 && Number(match[2]) === 0 && Number(match[3]) < 16)
  ) {
    console.error("需要支持CHECK约束的MySQL 8.0.16+；未执行迁移。");
    throw new Error("Unsupported database version");
  }
  const [lock] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [
    "tutor_workspace:s1:migrate",
  ]);
  if (Number(lock[0].acquired) !== 1) {
    console.error("未取得S1迁移执行锁，未执行DDL。");
    throw new Error("Migration already running");
  }
  try {
    // Validate all files against the fixed, approved manifest before any DDL.
    const migrations = await Promise.all(
      manifest.map(async ({ version, tables, references }) => {
        const sql = await readFile(
          new URL("./migrations/" + version + ".sql", import.meta.url),
          "utf8",
        );
        return {
          version,
          tables,
          checksum: createHash("sha256").update(sql).digest("hex"),
          statements: parseApprovedMigration(version, sql, tables, references),
        };
      }),
    );
    const [tableRows] = await connection.query("SHOW TABLES");
    const tables = new Set(tableRows.map((row) => Object.values(row)[0]));
    if (
      !tables.has("schema_migrations") &&
      manifest.some((entry) => entry.tables.some((table) => tables.has(table)))
    ) {
      console.error("存在未登记的S1表，停止以避免覆盖。");
      throw new Error("Untracked tables");
    }
    for (const migration of migrations) {
      await assertApprovedDatabase(connection);
      if (tables.has("schema_migrations")) {
        const [rows] = await connection.execute(
          "SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1",
          [migration.version],
        );
        if (rows.length) {
          if (rows[0].checksum !== migration.checksum) {
            console.error(
              migration.version + " 校验和不匹配；停止，未继续执行DDL。",
            );
            throw new Error("Migration checksum mismatch");
          }
          if (migration.version === "007_students_version")
            await checkStudentVersion(connection, true);
          if (migration.version === "010_authorization_audit")
            await checkAuthorizationAuditIndex(connection, true);
          if (migration.version === "011_experience_students_trial_contracts")
            await checkExperienceTrialStructure(connection, true);
          if (migration.version === "012_learning_record_subject")
            await checkLearningRecordSubjectStructure(connection, true);
          if (migration.version === "013_score_records")
            await checkScoreRecordsStructure(connection, true);
          if (migration.version === "014_audit_score_record")
            await checkScoreRecordAuditStructure(connection, true);
          if (migration.version === "015_attendance_records")
            await checkAttendanceRecordsStructure(connection, true);
          if (migration.version === "016_audit_attendance_record")
            await checkAttendanceAuditStructure(connection, true);
          if (migration.version === "017_expand_student_grades")
            await checkExpandedStudentGradesStructure(connection, true);
          if (migration.version === "018_task_plan_progress")
            await checkTaskPlanProgressStructure(connection, true);
          console.log(migration.version + " 已应用，跳过。");
          continue;
        }
        if (migration.tables.some((table) => tables.has(table))) {
          console.error(
            "检测到未完成或未登记的DDL，需人工核对；不会自动覆盖或删除。",
          );
          throw new Error("Partial migration");
        }
        if (migration.version === "017_expand_student_grades") {
          const structureAlreadyApplied =
            await checkExpandedStudentGradesStructure(connection, false);
          if (structureAlreadyApplied) {
            await assertApprovedDatabase(connection);
            await connection.execute(
              "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
              [migration.version, migration.checksum],
            );
            console.log(migration.version + " 已核对既有结构并登记，跳过DDL。");
            continue;
          }
        }
      }
      if (migration.version === "007_students_version")
        await checkStudentVersion(connection, false);
      if (migration.version === "010_authorization_audit")
        await checkAuthorizationAuditIndex(connection, false);
      if (migration.version === "011_experience_students_trial_contracts")
        await checkExperienceTrialStructure(connection, false);
      if (migration.version === "012_learning_record_subject")
        await checkLearningRecordSubjectStructure(connection, false);
      if (migration.version === "013_score_records")
        await checkScoreRecordsStructure(connection, false);
      if (migration.version === "014_audit_score_record")
        await checkScoreRecordAuditStructure(connection, false);
      if (migration.version === "015_attendance_records")
        await checkAttendanceRecordsStructure(connection, false);
      if (migration.version === "016_audit_attendance_record")
        await checkAttendanceAuditStructure(connection, false);
      if (migration.version === "017_expand_student_grades")
        await checkExpandedStudentGradesStructure(connection, false);
      if (migration.version === "018_task_plan_progress")
        await checkTaskPlanProgressStructure(connection, false);
      for (const statement of migration.statements) {
        await assertApprovedDatabase(connection);
        await connection.query(statement);
      }
      if (migration.version === "007_students_version")
        await checkStudentVersion(connection, true);
      if (migration.version === "010_authorization_audit")
        await checkAuthorizationAuditIndex(connection, true);
      if (migration.version === "011_experience_students_trial_contracts")
        await checkExperienceTrialStructure(connection, true);
      if (migration.version === "012_learning_record_subject")
        await checkLearningRecordSubjectStructure(connection, true);
      if (migration.version === "013_score_records")
        await checkScoreRecordsStructure(connection, true);
      if (migration.version === "014_audit_score_record")
        await checkScoreRecordAuditStructure(connection, true);
      if (migration.version === "015_attendance_records")
        await checkAttendanceRecordsStructure(connection, true);
      if (migration.version === "016_audit_attendance_record")
        await checkAttendanceAuditStructure(connection, true);
      if (migration.version === "017_expand_student_grades")
        await checkExpandedStudentGradesStructure(connection, true);
      if (migration.version === "018_task_plan_progress")
        await checkTaskPlanProgressStructure(connection, true);
      await assertApprovedDatabase(connection);
      await connection.execute(
        "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
        [migration.version, migration.checksum],
      );
      migration.tables.forEach((table) => tables.add(table));
      console.log(migration.version + " 应用成功。");
    }
  } finally {
    await connection.execute("SELECT RELEASE_LOCK(?)", [
      "tutor_workspace:s1:migrate",
    ]);
  }
});
