import mysql from "mysql2/promise";

async function ensureTasksCompleted(conn, nameList, taskTitles, userName) {
  const [students] = await conn.execute("SELECT id,name FROM students WHERE name IN (?)", [nameList]);
  const studentMap = new Map(students.map((s) => [s.name, s.id]));

  const [target] = await conn.query(
    `SELECT ta.id, ta.student_id, s.name, t.title, ta.status, ta.completed_at
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN students s ON s.id = ta.student_id
      WHERE s.name IN (?)
        AND t.title IN (?)`,
    [nameList, taskTitles],
  );

  const [upsert] = await conn.query(
    `UPDATE task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN students s ON s.id = ta.student_id
       SET ta.status = 'completed',
           ta.completed_at = COALESCE(ta.completed_at, NOW(3)),
           ta.updated_at = NOW(3),
           ta.version = ta.version + 1
      WHERE s.name IN (?)
        AND t.title IN (?)
        AND ta.status <> 'completed'`,
    [nameList, taskTitles],
  );

  const [after] = await conn.query(
    `SELECT s.name,
            SUM(CASE WHEN t.title IN (?) THEN 1 ELSE 0 END) AS target_total,
            SUM(CASE WHEN t.title IN (?) AND ta.status='completed' THEN 1 ELSE 0 END) AS target_completed
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN students s ON s.id = ta.student_id
      WHERE s.name IN (?)
        AND t.title LIKE '拼读%'
      GROUP BY s.name
      ORDER BY FIELD(s.name, ?)`,
    [taskTitles, taskTitles, nameList, nameList],
  );

  return {
    requested_students: nameList,
    requested_task_count_per_student: Math.min(taskTitles.length, upsert.affectedRows + (0)),
    target_found_count: target.length,
    updated_rows: upsert.affectedRows,
    changed_rows: upsert.changedRows ?? null,
    after,
  };
}

async function main() {
  const cfg = {
    host: 'rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com',
    port: 3306,
    user: 'kcct144',
    password: '!Kcct1448',
    database: 'tutor_workspace',
  };

  const conn = await mysql.createConnection(cfg);
  try {
    const group1to3 = ['拼读 1-读', '拼读 1-听写', '拼读 2-读', '拼读 2-听写', '拼读 3-读', '拼读 3-听写'];
    const group11to12 = ['拼读 11-读', '拼读 11-听写', '拼读 12-读', '拼读 12-听写'];

    const r1 = await ensureTasksCompleted(conn, ['苏昕柔','张心怡'], group1to3);
    const r2 = await ensureTasksCompleted(conn, ['罗诗琪','杨梓欣'], group11to12);

    const summary = {
      user: '凯凯=v=',
      ops: [r1, r2],
    };

    const [verify] = await conn.execute(
      `SELECT s.name,
              t.title,
              ta.status,
              ta.completed_at
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
         JOIN students s ON s.id = ta.student_id
        WHERE ( (s.name IN ('苏昕柔','张心怡') AND t.title IN (?, ?, ?, ?, ?, ?))
             OR (s.name IN ('罗诗琪','杨梓欣') AND t.title IN (?, ?, ?, ?)) )
        ORDER BY s.name, t.title`,
      [...group1to3, ...group11to12],
    );

    console.log(JSON.stringify({ summary, verify }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});