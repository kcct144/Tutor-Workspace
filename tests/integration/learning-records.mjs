import assert from "node:assert/strict";
import {
  runDatabaseCommand,
  openDatabase,
} from "../../database/connection.mjs";
import {
  fixtureContext,
  apiContents,
} from "../../database/seeds/learning-record-fixtures.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { inTransaction } from "../../server/db/pool.ts";
import { shanghaiToday } from "../../server/db/contracts-rules.ts";
const base = new URL(process.env.S3_API_BASE_URL || "http://127.0.0.1:3001");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
)
  throw new Error("仅允许本机开发服务。");
await runDatabaseCommand(async (db) => {
  const { actorId, studentIds } = await fixtureContext(db),
    studentId = studentIds[2];
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s3:fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  let phase = "前置检查";
  const longContent = "😀".repeat(10000);
  async function request(path, method = "GET", body, expected = 200) {
    if (method !== "GET") await assertApprovedDatabase(db);
    const response = await fetch(new URL(path, base), {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== expected)
      console.error(
        `状态不符：预期${expected}，实际${response.status}，阶段${phase}`,
      );
    assert.equal(response.status, expected);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const value = await response.json();
    assert.equal(value.status, expected < 300 ? "ok" : "error");
    return value.data;
  }
  const list = (query = {}) =>
    request(
      "/api/learning-records/list?" +
        new URLSearchParams({ studentId, pageSize: "100", ...query }),
    );
  const update = (record, patch = {}, expected = 200) =>
    request(
      "/api/learning-records/update",
      "PATCH",
      {
        id: record.id,
        expectedVersion: record.version,
        category: record.category,
        subject: record.subject,
        content: record.content,
        occurredOn: record.occurredOn,
        ...patch,
      },
      expected,
    );
  try {
    const [migrations] = await db.execute(
      "SELECT version FROM schema_migrations WHERE version=? LIMIT 1",
      ["012_learning_record_subject"],
    );
    assert.equal(migrations.length, 1);
    const [rows] = await db.execute(
      "SELECT id,author_user_id,content,subject FROM student_learning_records WHERE student_id=? ORDER BY id LIMIT 3",
      [studentId],
    );
    assert.ok(rows.length <= 2);
    for (const row of rows) {
      assert.equal(String(row.author_user_id), actorId);
      assert.ok([...apiContents, longContent].includes(row.content));
    }
    const [baseline] = await db.execute(
      "SELECT (SELECT COUNT(*) FROM contracts) AS contracts,(SELECT COUNT(*) FROM students) AS students,(SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM schema_migrations) AS migrations",
    );
    phase = "FK/CHECK与双连接事务失败";
    const observer = await openDatabase();
    const count = async (connection) =>
      Number(
        (
          await connection.execute(
            "SELECT COUNT(*) AS total FROM student_learning_records WHERE student_id=?",
            [studentId],
          )
        )[0][0].total,
      );
    const beforeCount = await count(observer);
    try {
      const sentinel = new Error("Expected rollback");
      await assert.rejects(
        inTransaction(db, async () => {
          const insert =
            "INSERT INTO student_learning_records (student_id,author_user_id,category,subject,content,occurred_on,version) VALUES (?,?,?,?,?,?,?)";
          await executeWrite(db, insert, [
            studentId,
            actorId,
            "缺",
            null,
            "S3事务内回滚样例",
            "2000-01-01",
            1,
          ]);
          assert.equal(await count(observer), beforeCount);
          const badValues = [
            [
              "18446744073709551615",
              actorId,
              "缺",
              null,
              "正文",
              "2000-01-01",
              1,
            ],
            [
              studentId,
              "18446744073709551615",
              "缺",
              null,
              "正文",
              "2000-01-01",
              1,
            ],
            [studentId, actorId, "错", null, "正文", "2000-01-01", 1],
            [studentId, actorId, "缺", " ", "正文", "2000-01-01", 1],
            [
              studentId,
              actorId,
              "缺",
              "字".repeat(65),
              "正文",
              "2000-01-01",
              1,
            ],
            [studentId, actorId, "缺", null, " ", "2000-01-01", 1],
            [
              studentId,
              actorId,
              "缺",
              null,
              "字".repeat(10001),
              "2000-01-01",
              1,
            ],
            [studentId, actorId, "缺", null, "正文", "2000-01-01", 0],
          ];
          for (const values of badValues)
            await assert.rejects(executeWrite(db, insert, values), (error) =>
              [
                "ER_NO_REFERENCED_ROW_2",
                "ER_CHECK_CONSTRAINT_VIOLATED",
              ].includes(error.code),
            );
          throw sentinel;
        }),
        (error) => error === sentinel,
      );
      assert.equal(await count(observer), beforeCount);
    } finally {
      await observer.end();
    }
    console.log(phase + "：通过，无持久插入。");
    phase = "有界新增及非法字段";
    let records = (await list()).items.sort((a, b) =>
      Number(BigInt(a.id) - BigInt(b.id)),
    );
    for (let index = records.length; index < 2; index++)
      records.push(
        await request(
          "/api/learning-records/create",
          "POST",
          {
            studentId,
            category: index ? "补" : "缺",
            subject: index ? "数学" : null,
            content: apiContents[index],
            occurredOn: index ? "2000-01-02" : "2000-01-01",
          },
          201,
        ),
      );
    assert.equal(records.length, 2);
    const baseFields = {
      studentId,
      category: "缺",
      subject: null,
      content: apiContents[0],
      occurredOn: "2000-01-01",
    };
    for (const patch of [
      { authorUserId: "1" },
      { author: { id: "1" } },
      { actorId: "1" },
      { version: 1 },
      { expectedVersion: 1 },
      { id: "1" },
      { category: "其他" },
      { subject: " " },
      { subject: "学".repeat(65) },
      { content: "\n \t" },
      { content: "字".repeat(10001) },
      { occurredOn: "9999-12-31" },
      { occurredOn: "2026-02-29" },
    ])
      await request(
        "/api/learning-records/create",
        "POST",
        { ...baseFields, ...patch },
        400,
      );
    await request(
      "/api/learning-records/create",
      "POST",
      { ...baseFields, studentId: "18446744073709551615" },
      404,
    );
    await request(
      "/api/learning-records/create",
      "POST",
      { ...baseFields, content: "x".repeat(140000) },
      413,
    );
    for (const patch of [
      { studentId: studentIds[3] },
      { authorUserId: "1" },
      { version: 2 },
    ])
      await update(records[0], patch, 400);
    await update(records[0], { id: "18446744073709551615" }, 404);
    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { studentId: "0" },
      { category: "其他" },
      { dateFrom: "2000-01-03", dateTo: "2000-01-01" },
      { actorId: "1" },
    ])
      await request(
        "/api/learning-records/list?" +
          new URLSearchParams({ studentId, ...query }),
        "GET",
        undefined,
        400,
      );
    await request(
      "/api/learning-records/list?studentId=18446744073709551615",
      "GET",
      undefined,
      404,
    );
    console.log(phase + "：通过，固定验收记录最多2条。");
    phase = "编辑边界/作者绑定/并发版本";
    records[0] = await update(records[0], {
      category: "强",
      subject: "英语",
      content: " \n" + longContent + "\t ",
      occurredOn: shanghaiToday(),
    });
    assert.equal([...records[0].content].length, 10000);
    const results = await Promise.all(
      [200, 409].map(async () => {
        await assertApprovedDatabase(db);
        return fetch(new URL("/api/learning-records/update", base), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: records[0].id,
            expectedVersion: records[0].version,
            category: "强",
            subject: "英语",
            content: apiContents[0],
            occurredOn: shanghaiToday(),
          }),
          signal: AbortSignal.timeout(15000),
        });
      }),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    records = (await list()).items.sort((a, b) =>
      Number(BigInt(a.id) - BigInt(b.id)),
    );
    assert.equal(records[0].author.id, actorId);
    assert.equal(records[0].studentId, studentId);
    assert.deepEqual(
      Object.keys(records[0]).sort(),
      [
        "id",
        "studentId",
        "author",
        "category",
        "subject",
        "content",
        "occurredOn",
        "createdAt",
        "updatedAt",
        "version",
      ].sort(),
    );
    assert.deepEqual(Object.keys(records[0].author).sort(), ["id", "name"]);
    phase = "最近跟进回退与筛选分页";
    records[1] = await update(records[1], {
      category: "补",
      subject: "数学",
      content: apiContents[1],
      occurredOn: "2000-01-02",
    });
    const checkFollowUp = async (expected) => {
      const detail = await request("/api/students/detail?id=" + studentId);
      const students = await request("/api/students/list?pageSize=100");
      assert.equal(detail.lastFollowUp, expected);
      assert.equal(
        students.items.find((row) => row.id === studentId).lastFollowUp,
        expected,
      );
      const [max] = await db.execute(
        "SELECT MAX(occurred_on) AS value FROM student_learning_records WHERE student_id=?",
        [studentId],
      );
      assert.equal(max[0].value, expected);
      const sorted = [...students.items].sort(
        (a, b) =>
          (b.lastFollowUp ?? "").localeCompare(a.lastFollowUp ?? "") ||
          Number(BigInt(b.id) - BigInt(a.id)),
      );
      assert.deepEqual(
        students.items.map((s) => s.id),
        sorted.map((s) => s.id),
      );
    };
    await checkFollowUp(shanghaiToday());
    records[0] = await update(records[0], {
      category: "缺",
      subject: null,
      content: apiContents[0],
      occurredOn: "2000-01-01",
    });
    await checkFollowUp("2000-01-02");
    const filtered = await list({
      category: "补",
      subject: "数学",
      dateFrom: "2000-01-02",
      dateTo: "2000-01-02",
      keyword: "固定验收乙",
    });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].id, records[1].id);
    const subjectFiltered = await list({ subject: "数学" });
    assert.equal(subjectFiltered.total, 1);
    assert.equal(subjectFiltered.items[0].id, records[1].id);
    const first = await list({ page: "1", pageSize: "1" }),
      second = await list({ page: "2", pageSize: "1" });
    assert.equal(first.total, 2);
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.equal((await list({ page: "99999999" })).items.length, 0);
    assert.equal((await list({ keyword: "%' OR 1=1_!" })).total, 0);
    const other = await request(
      "/api/learning-records/list?studentId=" + studentIds[3],
    );
    assert.ok(other.items.every((row) => row.studentId === studentIds[3]));
    assert.ok(
      other.items.every((row) => !records.some((item) => item.id === row.id)),
    );
    const empty = await request(
      "/api/learning-records/list?studentId=" +
        studentIds[0] +
        "&keyword=必然不存在的固定筛选",
    );
    assert.equal(empty.total, 0);
    const [after] = await db.execute(
      "SELECT (SELECT COUNT(*) FROM contracts) AS contracts,(SELECT COUNT(*) FROM students) AS students,(SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM schema_migrations) AS migrations",
    );
    assert.deepEqual(after, baseline);
    assert.equal(await count(db), 2);
    const [debug] = await db.execute(
      "SELECT COUNT(*) AS total FROM student_learning_records WHERE content LIKE ?",
      ["S3接口测试-%"],
    );
    assert.equal(Number(debug[0].total), 0);
    console.log(
      "S3真实API全部通过：仅保留2条固定验收记录；其他领域未写入，无删除。",
    );
  } catch (error) {
    console.error(
      "S3测试停止于：" +
        phase +
        "；未输出敏感数据，已提交固定记录保留，不删除。",
    );
    console.error(
      error.stack
        ?.split("\n")
        .find((line) => line.includes("tests/integration/learning-records.mjs"))
        ?.trim() ?? "测试失败",
    );
    throw error;
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s3:fixtures"]);
  }
});
