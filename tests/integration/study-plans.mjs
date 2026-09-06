import assert from "node:assert/strict";
import {
  runDatabaseCommand,
  openDatabase,
} from "../../database/connection.mjs";
import {
  planFixtureContext,
  verifyPlanFixtures,
  planFixtures,
  unsafePlanContent,
  longPlanContent,
  browserPlanContent,
} from "../../database/seeds/study-plan-fixtures.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { inTransaction } from "../../server/db/pool.ts";
const base = new URL(process.env.S4_API_BASE_URL || "http://127.0.0.1:3001");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
)
  throw new Error("仅允许本机开发服务。");
await runDatabaseCommand(async (db) => {
  const { actorId, studentIds } = await planFixtureContext(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s4:fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  let phase = "固定样例前置检查";
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
        `S4阶段${phase}：HTTP预期${expected}，实际${response.status}`,
      );
    assert.equal(response.status, expected);
    const value = await response.json();
    assert.equal(value.status, expected < 300 ? "ok" : "error");
    assert.match(response.headers.get("cache-control"), /no-store/);
    return value.data;
  }
  const getPlan = (id) => request("/api/study-plans/detail?id=" + id);
  const update = (plan, content, expected = 200, extra = {}) =>
    request(
      "/api/study-plans/update",
      "PATCH",
      { id: plan.id, expectedVersion: plan.version, content, ...extra },
      expected,
    );
  const protectedCounts = async () =>
    (
      await db.query(
        "SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM students) AS students,(SELECT COUNT(*) FROM contracts) AS contracts,(SELECT COUNT(*) FROM student_learning_records) AS records,(SELECT COUNT(*) FROM schema_migrations) AS migrations",
      )
    )[0];
  try {
    const fixtures = await verifyPlanFixtures(db, actorId, studentIds);
    assert.ok(
      [
        planFixtures[0].content,
        unsafePlanContent,
        longPlanContent,
        " \n" + longPlanContent + "\n ",
      ].includes(fixtures[0].content),
    );
    assert.equal(fixtures[1].content, planFixtures[1].content);
    assert.ok(
      [planFixtures[2].content, browserPlanContent, unsafePlanContent].includes(
        fixtures[2].content,
      ),
    );
    const originalProtected = await protectedCounts();
    const firstId = String(fixtures[0].id),
      secondId = String(fixtures[1].id);
    phase = "真实数据库约束和事务回滚";
    const observer = await openDatabase();
    const counts = async (connection) =>
      (
        await connection.query(
          "SELECT (SELECT COUNT(*) FROM study_plan_documents) AS docs,(SELECT COUNT(*) FROM study_plan_students) AS links",
        )
      )[0];
    const before = await counts(observer);
    try {
      const sentinel = new Error("Rollback expected");
      await assert.rejects(
        inTransaction(db, async () => {
          const insert =
            "INSERT INTO study_plan_documents (owner_user_id,title,content,version) VALUES (?,?,?,?)";
          const created = await executeWrite(db, insert, [
            actorId,
            "S4仅事务内样例",
            "正文",
            1,
          ]);
          await executeWrite(
            db,
            "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
            [String(created.insertId), studentIds[0]],
          );
          assert.deepEqual(await counts(observer), before);
          for (const [sql, values] of [
            [insert, ["18446744073709551615", "样例", "正文", 1]],
            [insert, [actorId, " ", "正文", 1]],
            [insert, [actorId, "样例", "", 1]],
            [insert, [actorId, "样例", "正文", 0]],
            [
              "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
              [firstId, studentIds[0]],
            ],
            [
              "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
              [firstId, "18446744073709551615"],
            ],
            [
              "INSERT INTO study_plan_students (plan_id,student_id) VALUES (?,?)",
              ["18446744073709551615", studentIds[0]],
            ],
          ])
            await assert.rejects(executeWrite(db, sql, values), (error) =>
              [
                "ER_NO_REFERENCED_ROW_2",
                "ER_CHECK_CONSTRAINT_VIOLATED",
                "ER_DUP_ENTRY",
              ].includes(error.code),
            );
          throw sentinel;
        }),
        (error) => error === sentinel,
      );
      assert.deepEqual(await counts(observer), before);
    } finally {
      await observer.end();
    }
    console.log(phase + "：通过，无持久新增。");
    phase = "分页搜索与安全投影";
    let current = await getPlan(firstId);
    current = await update(current, planFixtures[0].content);
    const page1 = await request("/api/study-plans/list?pageSize=1"),
      page2 = await request("/api/study-plans/list?pageSize=1&page=2");
    assert.equal(page1.total, 3);
    assert.equal(page1.items.length, 1);
    assert.equal(page2.items.length, 1);
    assert.notEqual(page1.items[0].id, page2.items[0].id);
    assert.deepEqual(
      Object.keys(page1.items[0]).sort(),
      ["id", "title", "summary", "updatedAt", "version"].sort(),
    );
    assert.deepEqual(
      Object.keys(current).sort(),
      [
        "id",
        "title",
        "summary",
        "updatedAt",
        "version",
        "createdAt",
        "content",
        "owner",
      ].sort(),
    );
    for (const [keyword, total] of [
      ["S4标准演示计划", 2],
      ["固定样例甲", 1],
      ["正文唯一检索词甲", 1],
      ["%' OR 1=1_!", 0],
    ])
      assert.equal(
        (
          await request(
            "/api/study-plans/list?" + new URLSearchParams({ keyword }),
          )
        ).total,
        total,
      );
    assert.equal(
      (await request("/api/study-plans/list?page=99999")).items.length,
      0,
    );
    for (const query of [
      "page=0",
      "pageSize=101",
      "keyword=a&keyword=b",
      "actorId=1",
    ])
      await request("/api/study-plans/list?" + query, "GET", undefined, 400);
    await request("/api/study-plans/detail?id=0", "GET", undefined, 400);
    await request(
      "/api/study-plans/detail?id=18446744073709551615",
      "GET",
      undefined,
      404,
    );
    phase = "正文/权威字段/原文保留";
    for (const content of ["", " \n\t", "字".repeat(100001), null])
      await update(current, content, 400);
    for (const field of [
      "owner",
      "ownerUserId",
      "actor",
      "actorId",
      "title",
      "summary",
      "version",
      "studentIds",
    ])
      await update(current, "正文", 400, { [field]: "伪造" });
    await update(current, "x".repeat(2100000), 413);
    await update(current, "正文", 404, { id: "18446744073709551615" });
    const immutable = {
      title: current.title,
      summary: current.summary,
      owner: current.owner,
      createdAt: current.createdAt,
    };
    current = await update(current, " \n" + longPlanContent + "\n ");
    assert.equal(current.content, " \n" + longPlanContent + "\n ");
    current = await update(current, unsafePlanContent);
    assert.equal((await getPlan(firstId)).content, unsafePlanContent);
    assert.deepEqual(
      {
        title: current.title,
        summary: current.summary,
        owner: current.owner,
        createdAt: current.createdAt,
      },
      immutable,
    );
    phase = "并发版本冲突";
    const results = await Promise.all(
      [0, 1].map(async () => {
        await assertApprovedDatabase(db);
        return fetch(new URL("/api/study-plans/update", base), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: firstId,
            expectedVersion: current.version,
            content: planFixtures[0].content,
          }),
          signal: AbortSignal.timeout(15000),
        });
      }),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const after = await getPlan(firstId);
    assert.equal(after.version, current.version + 1);
    assert.equal(after.content, planFixtures[0].content);
    phase = "真实关联与所有学生投影";
    const [links] = await db.execute(
      "SELECT ps.student_id,p.id,p.title FROM study_plan_students ps JOIN study_plan_documents p ON p.id=ps.plan_id ORDER BY ps.student_id,p.id LIMIT ?",
      [5],
    );
    assert.equal(links.length, 4);
    const expected = new Map();
    for (const link of links) {
      const id = String(link.student_id);
      expected.set(id, [
        ...(expected.get(id) ?? []),
        { id: String(link.id), title: link.title },
      ]);
    }
    const students = await request("/api/students/list?pageSize=100");
    assert.equal(students.total, 12);
    for (const student of students.items) {
      assert.deepEqual(student.plans, expected.get(student.id) ?? []);
      assert.deepEqual(
        (await request("/api/students/detail?id=" + student.id)).plans,
        student.plans,
      );
    }
    assert.deepEqual(
      expected.get(studentIds[0]).map((p) => p.id),
      [firstId, secondId],
    );
    assert.equal(
      expected.get(studentIds[0])[0].title,
      expected.get(studentIds[0])[1].title,
    );
    assert.equal(expected.get(studentIds[1])[0].id, firstId);
    await verifyPlanFixtures(db, actorId, studentIds);
    assert.deepEqual(await protectedCounts(), originalProtected);
    console.log(
      "S4真实API全部通过：3份计划/4条关系不增加；12位学生关联一致；无其他领域写入或删除。",
    );
  } catch (error) {
    console.error(
      "S4测试停止于：" +
        phase +
        "；固定数据保留，不删除，不输出配置或驱动细节。",
    );
    console.error(
      error.stack
        ?.split("\n")
        .find((line) => line.includes("tests/integration/study-plans.mjs"))
        ?.trim() ?? "测试失败",
    );
    throw error;
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s4:fixtures"]);
  }
});
