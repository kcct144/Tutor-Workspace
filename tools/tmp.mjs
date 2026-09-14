import mysql from "mysql2/promise";

async function main() {
  const cfg = {host:'rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com',port:3306,user:'kcct144',password:'!Kcct1448',database:'tutor_workspace'};
  const conn = await mysql.createConnection(cfg);

  const [rows] = await conn.query(`SELECT s.name, ta.study_plan_id_snapshot, COUNT(*) AS cnt
    FROM task_assignments ta
    JOIN students s ON s.id = ta.student_id
    WHERE s.name IN ('罗诗琪','杨梓欣') AND t??`,[]);
  await conn.end();
}