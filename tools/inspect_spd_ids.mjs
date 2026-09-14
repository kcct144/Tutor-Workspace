import mysql from "mysql2/promise";

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
    const [rows] = await conn.query(
      `SELECT s.name, ta.study_plan_id_snapshot, ta.assigned_by, ta.task_id, t.title, ta.assigned_at, ta.due_date
         FROM task_assignments ta
         JOIN students s ON s.id = ta.student_id
         JOIN tasks t ON t.id = ta.task_id
        WHERE s.name IN ('罗诗琪','杨梓欣')
          AND t.title REGEXP '^拼读'
        ORDER BY s.name, ta.id`,
    );
    console.log(JSON.stringify(rows, null, 2));

    const [sIds] = await conn.query(`SELECT id,name FROM students WHERE name IN ('罗诗琪','杨梓欣')`);
    const [taskIds] = await conn.query(`SELECT id,title FROM tasks WHERE id BETWEEN 191 AND 194 ORDER BY id`);
    console.log('TASK_IDS', JSON.stringify(taskIds, null, 2));
    console.log('STUDENTS', JSON.stringify(sIds, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e)=>{console.error(e); process.exit(1);});