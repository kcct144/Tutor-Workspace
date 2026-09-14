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
    const [contracts] = await conn.execute(
      `SELECT id, student_id, contract_no, subject, contract_type, start_date, end_date, attended_lessons, total_lessons
         FROM contracts
        WHERE contract_type='month'
        ORDER BY id DESC
        LIMIT 40`,
    );
    console.log('MONTH_SAMPLE', JSON.stringify(contracts, null, 2));

    const [cidx] = await conn.execute('SHOW KEYS FROM contracts');
    console.log('CONTRACT_KEYS', JSON.stringify(cidx, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e)=>{console.error(e); process.exit(1);});