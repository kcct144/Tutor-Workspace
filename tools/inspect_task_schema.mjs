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
    const [tables] = await conn.query("SHOW TABLES");
    const names = tables.map((r) => Object.values(r)[0]);
    const hit = names.filter((n) => typeof n === 'string' && (n.includes('task') || n.includes('task') || n.includes('homework') || n.includes('mission') || n.includes('phonics') || n.includes('group') || n.includes('blended') || n.includes('reading') || n.includes('spell') || n.includes('拼') || n.includes('作业')));
    console.log('HIT', hit);

    const [cols] = await conn.execute(`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'tutor_workspace'
      ORDER BY TABLE_NAME, ORDINAL_POSITION`);

    const keywords = /task|任务|homework|作业|phon|拼读|reading|read|group|组|phase|lesson|course|课程|模块/;
    const candidate = cols.filter((r) => keywords.test(String(r.COLUMN_NAME).toLowerCase()) || keywords.test(String(r.TABLE_NAME).toLowerCase()));
    console.log('CANDIDATE_COLUMNS_COUNT', candidate.length);
    for (const row of candidate.slice(0, 500)) {
      console.log(row.TABLE_NAME + '.' + row.COLUMN_NAME + ' ' + row.DATA_TYPE + ' ' + row.COLUMN_TYPE);
    }

    const [students] = await conn.query("SELECT id,name FROM students WHERE name IN ('苏昕柔','张心怡','罗诗琪','杨梓欣')");
    console.log('TARGET_STUDENTS', students);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {console.error(e); process.exit(1);});