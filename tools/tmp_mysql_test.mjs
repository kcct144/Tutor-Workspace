const mysql = await import('C:/Users/Administrator/AppData/Roaming/npm/node_modules/mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: "rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com",
    port: 3306,
    user: "kcct144",
    password: "!Kcct1448",
    database: "tutor_workspace",
  });
  const [rows] = await conn.query('SELECT 1+1 AS two');
  console.log(rows);
  await conn.end();
})();