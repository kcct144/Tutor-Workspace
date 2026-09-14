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
    const [scols] = await conn.execute("DESCRIBE students");
    const [ccols] = await conn.execute("DESCRIBE contracts");
    console.log('STUDENTS_COLUMNS', scol);
  } finally {
    await conn.end();
  }
}
