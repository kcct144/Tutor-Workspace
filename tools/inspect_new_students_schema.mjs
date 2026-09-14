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
    console.log('STUDENTS_COLUMNS', JSON.stringify(scols, null, 2));
    console.log('CONTRACTS_COLUMNS', JSON.stringify(ccols, null, 2));

    const [sampleMonth] = await conn.execute(
      `SELECT id, student_id, contract_type, subject, start_date, end_date, attended_lessons, total_lessons, trial_status, status
         FROM contracts
        WHERE contract_type='month'
        ORDER BY id DESC
        LIMIT 20`,
    );
    console.log('SAMPLE_MONTH', JSON.stringify(sampleMonth, null, 2));

    const [schoolCols] = await conn.execute("DESCRIBE schools");
    console.log('SCHOOLS_COLUMNS', JSON.stringify(schoolCols, null, 2));

    const [classCols] = await conn.execute("DESCRIBE classes");
    console.log('CLASSES_COLUMNS', JSON.stringify(classCols, null, 2));

    const [schools] = await conn.execute("SELECT id,name FROM schools ORDER BY id");
    console.log('SCHOOLS', JSON.stringify(schools, null, 2));

    const [classes] = await conn.execute("SELECT id,name,grade, school_id FROM classes ORDER BY id");
    console.log('CLASSES', JSON.stringify(classes, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});