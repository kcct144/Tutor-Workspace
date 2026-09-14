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
    const [rows] = await conn.execute(
      `SELECT
         ta.id AS assignment_id,
         t.id AS task_id,
         t.title,
         t.status AS task_status,
         ta.status AS assignment_status,
         s.name AS student_name,
         ta.assigned_at,
         ta.completed_at,
         ta.version
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN students s ON s.id = ta.student_id
       WHERE s.name IN ('苏昕柔','张心怡','罗诗琪','杨梓欣')
         AND (t.title LIKE '%拼读%' OR t.title LIKE '%第%组%' OR t.title LIKE '%拼%')
       ORDER BY s.name, t.id`,
    );
    console.log(JSON.stringify(rows, null, 2));

    const [distinct] = await conn.execute(
      `SELECT DISTINCT t.id, t.title FROM tasks t WHERE t.title LIKE '%拼读%' ORDER BY t.id LIMIT 200`,
    );
    console.log('DISTINCT_PINDU', JSON.stringify(distinct, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });