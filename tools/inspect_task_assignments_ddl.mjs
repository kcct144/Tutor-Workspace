import mysql from "mysql2/promise";
(async()=>{
  const conn = await mysql.createConnection({host:'rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com',port:3306,user:'kcct144',password:'!Kcct1448',database:'tutor_workspace'});
  const [create] = await conn.query("SHOW CREATE TABLE task_assignments\n");
  console.log(create[0]['Create Table']);
  const [idx] = await conn.query('SHOW KEYS FROM task_assignments');
  console.log('IDX', idx);
  await conn.end();
})();