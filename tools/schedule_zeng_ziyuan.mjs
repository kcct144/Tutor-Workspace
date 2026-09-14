import mysql from "mysql2/promise";

async function main() {
  const cfg = {
    host: "rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com",
    port: 3306,
    user: "kcct144",
    password: "!Kcct1448",
    database: "tutor_workspace",
  };

  const conn = await mysql.createConnection(cfg);
  try {
    const studentName = "曾梓媛";
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [students] = await conn.execute("SELECT id, name FROM students WHERE name = ? LIMIT 1", [studentName]);
    if (students.length === 0) {
      console.log(JSON.stringify({ student: studentName, status: "not_found" }));
      return;
    }
    const studentId = students[0].id;

    const [active] = await conn.execute(
      `SELECT
         MAX(DATE(end_date)) AS max_end
       FROM contracts
       WHERE student_id = ?
         AND contract_type <> 'lessons'
         AND (
           CASE WHEN contract_type='trial' THEN CASE WHEN trial_status='active' THEN '生效中' ELSE '已终止' END
                WHEN start_date > ? THEN '未开始'
                WHEN end_date < ? THEN '已到期'
                ELSE '生效中' END
         ) IN ('生效中','进行中')`,
      [studentId, today, today],
    );

    const endDate = active[0]?.max_end;
    if (!endDate) {
      console.log(JSON.stringify({ student: studentName, status: "no_active_contract", today }));
      return;
    }

    const end = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(endDate);
    if (end < today) {
      console.log(JSON.stringify({ student: studentName, status: "inactive_range", today, active_end: end }));
      return;
    }

    const [targetRows] = await conn.execute(
      `WITH RECURSIVE date_series AS (
         SELECT ? AS attendance_date
         UNION ALL
         SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY)
           FROM date_series
          WHERE attendance_date < ?
       )
       SELECT COUNT(*) AS target_rows
         FROM (
           SELECT attendance_date, 'evening' AS period
             FROM date_series
            WHERE DAYOFWEEK(attendance_date) IN (2,3,4,5)
           UNION ALL
           SELECT attendance_date, 'afternoon' AS period
             FROM date_series
            WHERE DAYOFWEEK(attendance_date) = 7
           UNION ALL
           SELECT attendance_date, 'morning' AS period
             FROM date_series
            WHERE DAYOFWEEK(attendance_date) = 1
           UNION ALL
           SELECT attendance_date, 'afternoon' AS period
             FROM date_series
            WHERE DAYOFWEEK(attendance_date) = 1
         ) AS period_set`,
      [today, end],
    );
    const expected = Number(targetRows[0]?.target_rows || 0);

    const userId = 3;
    const [upsert] = await conn.execute(
      `INSERT INTO attendance_records
        (student_id, attendance_date, period, status, created_by, updated_by, version)
      WITH RECURSIVE date_series AS (
         SELECT ? AS attendance_date
         UNION ALL
         SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY)
           FROM date_series
          WHERE attendance_date < ?
       )
      SELECT
        ?,
        p.attendance_date,
        p.period,
        'scheduled',
        ?,
        ?,
        1
       FROM (
        SELECT attendance_date, 'evening' AS period
          FROM date_series
         WHERE DAYOFWEEK(attendance_date) IN (2,3,4,5)
        UNION ALL
        SELECT attendance_date, 'afternoon' AS period
          FROM date_series
         WHERE DAYOFWEEK(attendance_date) = 7
        UNION ALL
        SELECT attendance_date, 'morning' AS period
          FROM date_series
         WHERE DAYOFWEEK(attendance_date) = 1
        UNION ALL
        SELECT attendance_date, 'afternoon' AS period
          FROM date_series
         WHERE DAYOFWEEK(attendance_date) = 1
       ) AS p
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_by = VALUES(updated_by),
        updated_at = NOW(3),
        version = version + 1`,
      [today, end, studentId, userId, userId],
    );

    const [verify] = await conn.execute(
      `SELECT
         COUNT(*) AS total_rows,
         SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) AS scheduled_rows
       FROM attendance_records
       WHERE student_id = ?
         AND attendance_date BETWEEN ? AND ?
         AND (
           (period = 'evening' AND DAYOFWEEK(attendance_date) IN (2,3,4,5))
           OR (period = 'afternoon' AND DAYOFWEEK(attendance_date) IN (1,7))
           OR (period = 'morning' AND DAYOFWEEK(attendance_date) = 1)
         )`,
      [studentId, today, end],
    );

    console.log(JSON.stringify({
      student: studentName,
      status: "scheduled",
      studentId,
      today,
      active_end: end,
      expected_rows: expected,
      affected_rows: upsert.affectedRows,
      changed_rows: upsert.changedRows,
      insert_id: upsert.insertId,
      scheduled_rows_in_range: verify[0]?.scheduled_rows ?? 0,
      total_rows_in_range: verify[0]?.total_rows ?? 0,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});