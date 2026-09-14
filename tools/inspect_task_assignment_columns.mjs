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
      `SELECT ta.*, t.title
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE ta.student_id = 30
       ORDER BY ta.id DESC
       LIMIT 20`,
    );
    console.log(JSON.stringify(rows, null, 2));

    const [tmpl] = await conn.query(
      `SELECT * FROM task_assignments WHERE student_id = 30 ORDER BY id LIMIT 1`,
    );
    console.log('ONE', JSON.stringify(tmpl, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e)=>{console.error(e); process.exit(1);});