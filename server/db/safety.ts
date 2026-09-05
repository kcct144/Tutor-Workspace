import type { Connection } from "mysql2/promise";

export const APPROVED_DATABASE = "tutor_workspace";

export class DatabaseBoundaryError extends Error {
  constructor() {
    super("数据库范围校验未通过，操作已停止。");
    this.name = "DatabaseBoundaryError";
  }
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
  if (/--|\/\*|#/.test(sql)) throw new Error("迁移文件不允许注释或隐藏语句。");
  const statements = sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!statements.length) throw new Error("迁移文件为空。");
  for (const statement of statements) {
    if (
      !/^CREATE TABLE (schema_migrations|users|students)\s*\(/i.test(
        statement,
      ) ||
      /\.|\b(USE|DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|SELECT|DATABASE|SCHEMA|LIKE|RENAME)\b/i.test(
        statement.replace(/ON (DELETE|UPDATE) RESTRICT/gi, ""),
      )
    ) {
      throw new Error("迁移超出S1建表范围。");
    }
    const references = [...statement.matchAll(/REFERENCES\s+(\w+)/gi)];
    if (references.some((match) => match[1] !== "users"))
      throw new Error("迁移引用超出S1范围。");
  }
  return statements;
}
