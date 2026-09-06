import { assertApprovedDatabase } from "../server/db/safety.ts";

export async function checkStudentVersion(db, applied) {
  await assertApprovedDatabase(db);
  const [columns] = await db.execute(
    "SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    ["students", "version"],
  );
  const [checks] = await db.execute(
    "SELECT cc.CHECK_CLAUSE, tc.ENFORCED FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=? AND tc.CONSTRAINT_NAME=? LIMIT 1",
    ["students", "chk_students_version"],
  );
  if (!applied) {
    if (columns.length || checks.length)
      throw new Error("发现未登记的版本结构，停止人工核对。");
    return;
  }
  const column = columns[0],
    check = checks[0];
  if (
    !column ||
    column.COLUMN_TYPE !== "int unsigned" ||
    column.IS_NULLABLE !== "NO" ||
    String(column.COLUMN_DEFAULT) !== "1" ||
    column.EXTRA !== "" ||
    !check ||
    check.ENFORCED !== "YES" ||
    check.CHECK_CLAUSE.replace(/[`()\s]/g, "") !== "version>0"
  )
    throw new Error("学生版本结构不符合批准定义。");
  const [invalid] = await db.query(
    "SELECT COUNT(*) AS total FROM students WHERE version IS NULL OR version<1 LIMIT 1",
  );
  if (Number(invalid[0].total)) throw new Error("学生版本数据不符合约束。");
}
