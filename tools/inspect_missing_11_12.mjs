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
      `SELECT s.name, t.title, ta.id AS assignment_id, ta.status, ta.completed_at
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN students s ON s.id = ta.student_id
       WHERE s.name IN ('罗诗琪','杨梓欣')
         AND t.title REGEXP '拼读 1(1|2)-'
       ORDER BY s.name, t.title`,
    );
    console.log('FOUND', JSON.stringify(rows, null, 2));

    const [allTitles] = await conn.query(
      `SELECT id,title FROM tasks WHERE title IN ('拼读 11-读','拼读 11-听写','拼读 12-读','拼读 12-听写') ORDER BY id`,
    );
    console.log('TASKS', JSON.stringify(allTitles, null, 2));

    const [students] = await conn.query(
      `SELECT id,name FROM students WHERE name IN ('罗诗琪','杨梓欣')`,
    );
    console.log('STUDENTS', JSON.stringify(students, null, 2));

  } finally {
    await conn.end();
  }
}

main().catch((e) => {console.error(e); process.exit(1);});