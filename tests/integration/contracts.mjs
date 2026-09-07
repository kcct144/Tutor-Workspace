import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  openDatabase,
  runDatabaseCommand,
} from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { resolveSeedAdministrator } from "../../server/db/seed-actor.ts";
import { inTransaction } from "../../server/db/pool.ts";
import {
  contractStatusSql,
  shanghaiToday,
} from "../../server/db/contracts-rules.ts";
import {
  createContract,
  studentContractAggregates,
} from "../../server/db/contracts.ts";

const baseUrl = new URL(process.env.S2_API_BASE_URL || "http://127.0.0.1:3001");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname) ||
  baseUrl.protocol !== "http:"
)
  throw new Error("仅允许本机开发服务器。");
async function request(path, method = "GET", body, expected = 200) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== expected)
    console.error(
      "HTTP状态不匹配：",
      new URL(path, baseUrl).pathname,
      "预期",
      expected,
      "实际",
      response.status,
    );
  assert.equal(response.status, expected);
  const result = await response.json();
  assert.equal(result.status, expected < 300 ? "ok" : "error");
  assert.match(response.headers.get("cache-control"), /no-store/);
  return result.data;
}
async function phase(name, work) {
  try {
    await work();
    console.log(name + "：通过");
  } catch (error) {
    console.error(name + "：未通过（不输出请求/驱动详细信息）");
    console.error(
      error.stack
        ?.split("\n")
        .find((line) => line.includes("tests/integration/contracts.mjs"))
        ?.trim() ?? "测试步骤失败",
    );
    throw error;
  }
}
function writeFields(c) {
  return {
    studentId: c.studentId,
    subject: c.subject,
    contractType: c.contractType,
    startDate: c.startDate,
    endDate: c.endDate,
    attendedLessons: c.attendedLessons,
    totalLessons: c.totalLessons,
    makeupLessons: c.makeupLessons,
  };
}
await runDatabaseCommand(async (connection) => {
  const actorId = await resolveSeedAdministrator(connection);
  const [actors] = await connection.execute(
    "SELECT id FROM users WHERE id = ? AND name = ? LIMIT 1",
    [actorId, "S1合成演示老师"],
  );
  assert.equal(actors.length, 1);
  const today = shanghaiToday();
  const day = (offset) => {
    const date = new Date(today + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const [students] = await connection.execute(
    "SELECT s.id, s.name FROM students s WHERE s.note = ? AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.student_id = s.id AND (" +
      contractStatusSql +
      ") = '生效中') ORDER BY s.id DESC LIMIT 1",
    ["仅用于S1联调的合成记录，不代表真实学生。", today, today],
  );
  assert.equal(students.length, 1, "需要至少一个无有效合同的S1合成学生");
  const studentId = String(students[0].id);
  const prefix = "S2接口测试-" + randomUUID().slice(0, 8);
  const base = {
    studentId,
    subject: prefix,
    contractType: "month",
    startDate: today,
    endDate: day(10),
    attendedLessons: null,
    totalLessons: null,
    makeupLessons: 0,
  };
  const created = [];
  await phase("数据库约束、唯一键和真实双连接回滚", async () => {
    const second = await openDatabase();
    try {
      const [before] = await connection.query(
        "SELECT COUNT(*) AS total FROM contracts",
      );
      await assert.rejects(
        () =>
          inTransaction(connection, async () => {
            const first = await createContract(connection, base, actorId);
            const [uncommitted] = await second.execute(
              "SELECT id FROM contracts WHERE id = ? LIMIT 1",
              [first.id],
            );
            assert.equal(uncommitted.length, 0);
            async function raw(patch = {}) {
              const c = { ...base, contractNo: randomUUID(), ...patch };
              return executeWrite(
                connection,
                "INSERT INTO contracts (contract_no, student_id, subject, contract_type, start_date, end_date, attended_lessons, total_lessons, makeup_lessons, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  c.contractNo,
                  c.studentId,
                  c.subject,
                  c.contractType,
                  c.startDate,
                  c.endDate,
                  c.attendedLessons,
                  c.totalLessons,
                  c.makeupLessons,
                  actorId,
                  actorId,
                ],
              );
            }
            await assert.rejects(
              () => raw({ contractNo: first.contractNo }),
              (error) => error.code === "ER_DUP_ENTRY",
            );
            for (const patch of [
              { contractType: "invalid" },
              { startDate: null },
              { attendedLessons: 1 },
              { endDate: day(-1) },
              { subject: " " },
              {
                contractType: "lessons",
                startDate: null,
                endDate: null,
                attendedLessons: 2,
                totalLessons: 1,
              },
              {
                contractType: "lessons",
                startDate: null,
                endDate: null,
                attendedLessons: null,
                totalLessons: 1,
              },
            ])
              await assert.rejects(
                () => raw(patch),
                (error) => error.code === "ER_CHECK_CONSTRAINT_VIOLATED",
              );
            await assert.rejects(
              () => raw({ studentId: "18446744073709551615" }),
              (error) => error.code === "ER_NO_REFERENCED_ROW_2",
            );
            await assert.rejects(
              () => raw({ makeupLessons: -1 }),
              (error) =>
                error.code === "ER_WARN_DATA_OUT_OF_RANGE" ||
                error.code === "ER_CHECK_CONSTRAINT_VIOLATED",
            );
            // An intentionally failed multi-write operation must not leave its earlier insert.
            throw new Error("S2_EXPECTED_TRANSACTION_FAILURE");
          }),
        /S2_EXPECTED_TRANSACTION_FAILURE/,
      );
      const [after] = await second.query(
        "SELECT COUNT(*) AS total FROM contracts",
      );
      assert.equal(Number(after[0].total), Number(before[0].total));
    } finally {
      await second.end();
    }
  });
  await phase("无有效合同学生无mock兜底", async () => {
    const student = await request("/api/students/detail?id=" + studentId);
    assert.deepEqual(student.subjects, []);
    assert.equal(student.expiryDate, null);
  });
  await phase("四类创建、日期边界和编号只读", async () => {
    const inputs = [
      base,
      { ...base, contractType: "half_year", endDate: day(5) },
      {
        ...base,
        subject: prefix + "今天",
        contractType: "year",
        endDate: today,
      },
      {
        ...base,
        subject: prefix + "未来",
        startDate: day(1),
        endDate: day(365),
      },
      {
        ...base,
        subject: prefix + "过去",
        startDate: day(-10),
        endDate: day(-1),
      },
      {
        ...base,
        subject: prefix + "课时",
        contractType: "lessons",
        startDate: null,
        endDate: null,
        attendedLessons: 0,
        totalLessons: 10,
      },
      {
        ...base,
        subject: prefix + "耗尽",
        contractType: "lessons",
        startDate: null,
        endDate: null,
        attendedLessons: 1,
        totalLessons: 1,
      },
    ];
    for (const input of inputs)
      created.push(await request("/api/contracts/create", "POST", input, 201));
    assert.equal(
      new Set(created.map((c) => c.contractNo)).size,
      created.length,
    );
    for (const c of created) {
      assert.match(
        c.contractNo,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      assert.equal("created_by" in c, false);
    }
    assert.deepEqual(
      created.map((c) => c.status),
      ["生效中", "生效中", "生效中", "未开始", "已到期", "生效中", "已用完"],
    );
    for (const patch of [
      { contractNo: randomUUID() },
      { actorId },
      { asOfDate: today },
      { totalLessons: 1 },
      { startDate: null },
      { startDate: "2026-02-30" },
      { makeupLessons: -1 },
      { makeupLessons: 0.5 },
    ])
      await request(
        "/api/contracts/create",
        "POST",
        { ...base, ...patch },
        400,
      );
    await request(
      "/api/contracts/update",
      "PATCH",
      {
        ...base,
        id: created[0].id,
        expectedVersion: 1,
        contractNo: created[0].contractNo,
      },
      400,
    );
    await request(
      "/api/contracts/create",
      "POST",
      { ...base, studentId: "18446744073709551615" },
      404,
    );
    await request(
      "/api/contracts/create",
      "POST",
      { ...base, subject: "字".repeat(18000) },
      413,
    );
  });
  async function assertStudent(subjects, expiryDate) {
    const detail = await request("/api/students/detail?id=" + studentId);
    const page = await request(
      "/api/students/list?" +
        new URLSearchParams({ keyword: students[0].name }),
    );
    const row = page.items.find((item) => item.id === studentId);
    assert.ok(row);
    assert.deepEqual(detail.subjects, [...subjects].sort());
    assert.equal(detail.expiryDate, expiryDate);
    assert.deepEqual(row.subjects, detail.subjects);
    assert.equal(row.expiryDate, detail.expiryDate);
    const aggregates = await studentContractAggregates(connection, [studentId]);
    assert.deepEqual(
      aggregates.get(studentId)?.subjects ?? [],
      detail.subjects,
    );
  }
  await phase("多合同去重、最早有效到期及保存刷新一致", async () => {
    await assertStudent([prefix, prefix + "今天", prefix + "课时"], today);
    const contract = created[2];
    created[2] = await request("/api/contracts/update", "PATCH", {
      ...writeFields(contract),
      startDate: day(-10),
      endDate: day(-1),
      id: contract.id,
      expectedVersion: contract.version,
    });
    assert.equal(created[2].contractNo, contract.contractNo);
    await assertStudent([prefix, prefix + "课时"], day(5));
    const first = created[1];
    created[1] = await request("/api/contracts/update", "PATCH", {
      ...writeFields(first),
      startDate: day(1),
      id: first.id,
      expectedVersion: first.version,
    });
    await assertStudent([prefix, prefix + "课时"], day(10));
    const lessons = created[5];
    created[5] = await request("/api/contracts/update", "PATCH", {
      ...writeFields(lessons),
      attendedLessons: 10,
      id: lessons.id,
      expectedVersion: lessons.version,
    });
    await assertStudent([prefix], day(10));
  });
  await phase("真实并发版本冲突与错误分页", async () => {
    const c = created[0];
    const body = {
      ...writeFields(c),
      id: c.id,
      expectedVersion: c.version,
      makeupLessons: 1,
    };
    const responses = await Promise.all(
      [0, 1].map(() =>
        fetch(new URL("/api/contracts/update", baseUrl), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    created[0] = await request("/api/contracts/detail?id=" + c.id);
    assert.equal(created[0].version, c.version + 1);
    assert.equal(created[0].contractNo, c.contractNo);
    await request(
      "/api/contracts/detail?id=18446744073709551615",
      "GET",
      undefined,
      404,
    );
    for (const query of [
      "page=0",
      "pageSize=101",
      "status=invalid",
      "contractType=invalid",
      "keyword=a&keyword=b",
      "actorId=1",
    ])
      await request("/api/contracts/list?" + query, "GET", undefined, 400);
    const first = await request(
      "/api/contracts/list?" +
        new URLSearchParams({
          studentId,
          keyword: prefix,
          pageSize: "2",
          page: "1",
        }),
    );
    const second = await request(
      "/api/contracts/list?" +
        new URLSearchParams({
          studentId,
          keyword: prefix,
          pageSize: "2",
          page: "2",
        }),
    );
    assert.equal(first.total, 7);
    assert.equal(first.items.length, 2);
    assert.equal(
      second.items.some((c) => first.items.some((a) => a.id === c.id)),
      false,
    );
    const empty = await request(
      "/api/contracts/list?page=1000000000&pageSize=100",
    );
    assert.equal(empty.items.length, 0);
    const filtered = await request(
      "/api/contracts/list?" +
        new URLSearchParams({
          studentId,
          subject: prefix,
          contractType: "month",
          status: "生效中",
        }),
    );
    assert.equal(filtered.items.length, 1);
    const subjects = await request(
      "/api/contracts/subjects?" +
        new URLSearchParams({ keyword: prefix, pageSize: "1" }),
    );
    assert.equal(subjects.items.length, 1);
    assert.equal(subjects.total, 6);
    const injection = await request(
      "/api/contracts/list?" + new URLSearchParams({ keyword: "%' OR 1=1_!" }),
    );
    assert.equal(injection.total, 0);
  });
  await phase("仅更新本次合成测试合同为失效状态并保留历史", async () => {
    for (const c of created) {
      const input = writeFields(c);
      if (c.contractType === "lessons")
        input.attendedLessons = input.totalLessons;
      else {
        input.startDate = day(-10);
        input.endDate = day(-1);
      }
      await request("/api/contracts/update", "PATCH", {
        ...input,
        id: c.id,
        expectedVersion: c.version,
      });
    }
    await assertStudent([], null);
  });
  await assertApprovedDatabase(connection);
  console.log(
    "S2真实接口验证完成；保留本次7条已失效合成测试合同，无删除/清库。",
  );
});
