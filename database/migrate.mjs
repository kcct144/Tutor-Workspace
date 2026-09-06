import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runDatabaseCommand } from "./connection.mjs";
import { assertApprovedDatabase, parseMigration } from "../server/db/safety.ts";

const manifest = [
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
];
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
          statements: parseMigration(sql, tables, references),
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
          console.log(migration.version + " 已应用，跳过。");
          continue;
        }
        if (migration.tables.some((table) => tables.has(table))) {
          console.error(
            "检测到未完成或未登记的DDL，需人工核对；不会自动覆盖或删除。",
          );
          throw new Error("Partial migration");
        }
      }
      for (const statement of migration.statements) {
        await assertApprovedDatabase(connection);
        await connection.query(statement);
      }
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
