import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addMonthsByDateStr(yyyyMmDd, months = 1) {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  // add months in UTC midnight-equivalent and format YYYY-MM-DD
  const utcMs = d.getTime();
  const utcDate = new Date(utcMs);
  const target = new Date(utcDate);
  target.setUTCMonth(target.getUTCMonth() + months);
  return formatShanghaiDate(target);
}

async function ensureStudentAndMonthContracts(conn, studentPayload, userId) {
  const result = {
    input: studentPayload,
    status: 'ok',
  };

  const { name, school, grade, class_name, subjects, start_date } = studentPayload;

  const [exists] = await conn.execute(
    "SELECT id, name, status FROM students WHERE name = ? LIMIT 10",
    [name],
  );

  if (exists.length > 0) {
    result.status = 'already_exists';
    result.matched_students = exists;
    return result;
  }

  const [insertStudent] = await conn.execute(
    `INSERT INTO students (owner_user_id, name, grade, class_name, school, status, enrolled_at, version)
     VALUES (?, ?, ?, ?, ?, '在读', ?, 1)`,
    [userId, name, grade, class_name, school, start_date],
  );

  const studentId = insertStudent.insertId;
  result.student_id = studentId;

  const [checks] = await conn.query(
    `SELECT id, contract_type, subject, start_date, end_date
       FROM contracts
      WHERE student_id = ? AND contract_type='month' AND subject IN (?)`,
    [studentId, subjects],
  );

  const created = [];
  const duplicated = [];
  for (const subject of subjects) {
    const existing = checks.find((c) => c.subject === subject);
    if (existing) {
      duplicated.push(subject);
      continue;
    }

    const contractNo = randomUUID();
    const [insertContract] = await conn.execute(
      `INSERT INTO contracts
         (student_id, contract_no, subject, contract_type, start_date, end_date, created_by, updated_by, version)
       VALUES (?, ?, ?, 'month', ?, ?, ?, ?, 1)`,
      [studentId, contractNo, subject, start_date, addMonthsByDateStr(start_date), userId, userId],
    );
    created.push({ subject, contract_id: insertContract.insertId, contract_no: contractNo, start_date, end_date: addMonthsByDateStr(start_date) });
  }

  result.created_contracts = created;
  result.skipped_subjects = duplicated;
  return result;
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
    const startDate = formatShanghaiDate(new Date());
    const userId = 3;

    const students = [
      {
        name: '林永涵',
        school: '西岭实验学校',
        grade: '初三',
        class_name: '2班',
        subjects: ['数学', '英语'],
        start_date: startDate,
      },
      {
        name: '黄烁言',
        school: '家炳一中',
        grade: '初三',
        class_name: '2班',
        subjects: ['数学', '英语'],
        start_date: startDate,
      },
    ];

    const outputs = [];
    for (const p of students) {
      outputs.push(await ensureStudentAndMonthContracts(conn, p, userId));
    }

    const [allNew] = await conn.query(
      `SELECT id, name, school, grade, class_name, status, enrolled_at
         FROM students
        WHERE name IN (?, ?)`,
      ['林永涵', '黄烁言'],
    );

    const [contracts] = await conn.query(
      `SELECT c.id, c.student_id, s.name, c.subject, c.contract_type, DATE(c.start_date) AS start_date, DATE(c.end_date) AS end_date
         FROM contracts c
         JOIN students s ON s.id = c.student_id
        WHERE s.name IN (?, ?)
          AND c.contract_type = 'month'
        ORDER BY s.name, c.subject`,
      ['林永涵', '黄烁言'],
    );

    console.log(JSON.stringify({
      start_date: startDate,
      end_date_rule: '1 month later via DATE_ADD(start_date, INTERVAL 1 MONTH)',
      results: outputs,
      students_snapshot: allNew,
      contracts_snapshot: contracts,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});