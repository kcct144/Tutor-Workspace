import {
  safeAssert as assert,
  boundedDatabase,
  createRecovery,
  profileState,
  runWithRecovery,
} from "./student-profile-recovery.mjs";
import { runDatabaseCommand } from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { profileBoundary, fixtureNames } from "./student-profile-boundary.mjs";

const base = process.env.S7_API_BASE_URL ?? "http://127.0.0.1:3001";
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base));
const common = {
  grade: "初一",
  school: null,
  className: null,
  gender: null,
  enrolledAt: null,
  guardianName: null,
  guardianPhone: null,
  note: null,
};
export const fixtures = [
  { ...common, name: fixtureNames[0] },
  {
    ...common,
    name: fixtureNames[1],
    school: "S7合成学校",
    className: "S7合成班",
    gender: "女",
    enrolledAt: "1900-01-01",
    guardianName: "合成监护人",
    guardianPhone: "00000000000",
    note: "S7固定重复甲",
  },
  {
    ...common,
    name: fixtureNames[1],
    school: "S7合成学校",
    className: "S7合成班",
    gender: "女",
    enrolledAt: "1900-01-01",
    guardianName: "合成监护人",
    guardianPhone: "00000000000",
    note: "S7固定重复乙",
  },
];
await runDatabaseCommand(async (db) => {
  db = boundedDatabase(db);
  await assertApprovedDatabase(db);
  const before = await profileBoundary(db);
  const [allBefore] = await db.query(
    "SELECT * FROM students ORDER BY id LIMIT 17",
  );
  assert.equal(allBefore.length, 16, "必须为既有16名学生；禁止创建或删除");
  let recovery;
  const pass = [],
    skip = [];
  const passed = (label) => {
    pass.push(label);
    console.log("[PASS] " + label);
  };
  const skipped = (label) => {
    skip.push(label);
    console.log("[SKIP] " + label + "：固定样例已存在，未重复创建");
  };
  async function request(path, method = "GET", body, expected = 200) {
    try {
      await assertApprovedDatabase(db);
    } catch {
      recovery?.uncertain();
      throw new Error("数据库边界或连接无法确认，停止写入（已脱敏）");
    }
    const writing = method !== "GET";
    if (writing && expected < 300) recovery.before(body);
    let response, data;
    try {
      response = await fetch(base + "/api/" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
      data = await response.json();
    } catch {
      recovery?.uncertain();
      throw new Error("请求结果不明（已脱敏）");
    }
    if (response.status >= 500) recovery?.uncertain();
    if (writing && response.ok) {
      if (expected >= 400) recovery.uncertain();
      else recovery.acknowledge(body, data.data);
    }
    assert.equal(
      response.status,
      expected,
      "HTTP状态不匹配：" + path.split("?")[0],
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(data.status, expected < 300 ? "ok" : "error");
    const errorCodes = {
      400: "VALIDATION_ERROR",
      404: "NOT_FOUND",
      409:
        path === "students/create"
          ? "STUDENT_POSSIBLE_DUPLICATE"
          : "VERSION_CONFLICT",
      413: "PAYLOAD_TOO_LARGE",
    };
    if (errorCodes[expected])
      assert.equal(
        data.data.code,
        errorCodes[expected],
        "S7公共错误码契约不匹配",
      );
    if (expected >= 400)
      assert.ok(!/stack|sql|password/i.test(JSON.stringify(data)));
    if (!path.startsWith("students/edit") && !path.startsWith("students/list"))
      assert.ok(!Object.hasOwn(data.data, "guardianPhone"));
    return data.data;
  }
  async function readRows() {
    const [rows] = await db.execute(
      "SELECT * FROM students WHERE name IN (?,?,?) ORDER BY id LIMIT 5",
      fixtureNames,
    );
    assert.ok(rows.length <= 4, "超过样例预算");
    return rows;
  }
  const initial = await readRows();
  assert.equal(initial.length, 4, "四名登记样例必须已存在，首次创建禁止执行");
  assert.deepEqual(
    initial.map((row) => String(row.id)),
    ["13", "14", "15", "16"],
    "固定样例ID不匹配",
  );
  for (const fixture of fixtures)
    assert.ok(
      initial.filter(
        (row) => row.name === fixture.name && row.note === fixture.note,
      ).length <= 1,
      "固定样例重复，停止",
    );
  assert.ok(
    initial.filter((row) => row.name === fixtureNames[2]).length <= 1,
    "浏览器样例重复，停止",
  );
  // Validate every existing fixture before ANY test write. No unknown rows overwritten.
  for (const row of initial) {
    const expected =
      fixtures.find((f) => f.name === row.name && f.note === row.note) ??
      (row.name === fixtureNames[2] && row.note === "S7浏览器验收"
        ? { ...common, name: fixtureNames[2], note: "S7浏览器验收" }
        : undefined);
    assert.ok(expected, "未知固定样例，停止");
    const edit = await request("students/edit?id=" + row.id);
    for (const [key, value] of Object.entries(expected))
      assert.equal(edit[key], value, "样例字段不匹配，停止");
    assert.equal(row.status, "待分配", "样例最终状态不匹配，停止");
    assert.equal(row.owner_user_id, null);
    assert.ok(Number.isInteger(row.version) && row.version >= 1);
  }
  const ids = [];
  for (const [index, fixture] of fixtures.entries()) {
    const row = initial.find(
      (row) => row.name === fixture.name && row.note === fixture.note,
    );
    assert.ok(row, "登记样例缺失，禁止创建");
    ids.push(String(row.id));
    skipped(index === 2 ? "重复确认后首次创建" : "首次创建样例" + (index + 1));
  }
  console.log(
    "允许修改的固定样例已核对：id=13；只读样例=14,15,16；总数=16；无新增预算。",
  );
  recovery = createRecovery(
    [profileState(initial[0])],
    async (studentId) => {
      await assertApprovedDatabase(db);
      const [rows] = await db.execute(
        "SELECT * FROM students WHERE id=? LIMIT 1",
        [studentId],
      );
      assert.equal(rows.length, 1);
      return profileState(rows[0]);
    },
    (action, body) => request("students/" + action, "PATCH", body),
  );
  await runWithRecovery(
    async () => {
      const duplicate = await request(
        "students/create",
        "POST",
        fixtures[2],
        409,
      );
      assert.equal(duplicate.code, "STUDENT_POSSIBLE_DUPLICATE");
      assert.ok(
        duplicate.candidates.length > 0 && duplicate.candidates.length <= 5,
      );
      assert.ok(
        duplicate.candidates.every(
          (item) =>
            !Object.hasOwn(item, "guardianPhone") &&
            !Object.hasOwn(item, "guardian_phone"),
        ),
      );
      passed("重复运行首次未确认仍拒绝");
      const id = ids[0];
      const labels = await request("students/options?ids=" + ids.join(","));
      assert.equal(labels.items.length, 3);
      assert.ok(
        labels.items.every(
          (item) => Object.keys(item).sort().join(",") === "grade,id,name",
        ),
      );
      for (const query of ["ids=1,1", "ids=0", "ids=1&keyword=x"])
        await request("students/options?" + query, "GET", undefined, 400);
      const invalid = [
        { name: " " },
        { name: "𠮷".repeat(65) },
        { grade: "高三" },
        { school: "校".repeat(129) },
        { className: "班".repeat(33) },
        { gender: "未知" },
        { guardianName: "人".repeat(65) },
        { guardianPhone: "00000" },
        { guardianPhone: "000****0000" },
        { guardianPhone: "0".repeat(33) },
        { note: "记".repeat(501) },
        { enrolledAt: "1899-12-31" },
        { enrolledAt: "9999-12-31" },
        { enrolledAt: "2026-02-30" },
        { status: "在读" },
        { ownerUserId: "1" },
        { actorId: "1" },
        { version: 1 },
        { subjects: [] },
        { confirmPossibleDuplicate: "true" },
      ];
      for (const extra of invalid)
        await request(
          "students/create",
          "POST",
          { ...fixtures[0], ...extra },
          400,
        );
      await request(
        "students/create",
        "POST",
        { ...fixtures[0], note: "x".repeat(20000) },
        413,
      );
      for (const extra of [
        { status: "在读" },
        { ownerUserId: "1" },
        { version: 2 },
        { expectedVersion: 0 },
      ])
        await request(
          "students/update",
          "PATCH",
          { ...fixtures[0], id, expectedVersion: 1, ...extra },
          400,
        );
      await request(
        "students/status",
        "PATCH",
        { id, expectedVersion: 1, status: "删除" },
        400,
      );
      await request(
        "students/status",
        "PATCH",
        { id, expectedVersion: 1, status: "待分配", actorId: "1" },
        400,
      );
      await request(
        "students/edit?id=18446744073709551615",
        "GET",
        undefined,
        404,
      );
      await request(
        "students/update",
        "PATCH",
        { ...fixtures[0], id: "18446744073709551615", expectedVersion: 1 },
        404,
      );
      passed("非法字段/Unicode长度/电话/日期/枚举/413/不存在ID");
      let current = await request("students/detail?id=" + id);
      const homeBefore = await request("home/list?pageSize=100");
      for (const status of ["在读", "已结课", "在读", "待分配"]) {
        current = await request("students/status", "PATCH", {
          id,
          expectedVersion: current.version,
          status,
        });
        const home = await request("home/list?pageSize=100");
        assert.equal(
          home.activeStudents,
          homeBefore.activeStudents + (status === "在读" ? 1 : 0),
        );
        assert.equal(
          home.items.some((item) => item.id === id),
          status === "在读",
        );
      }
      const [timeBefore] = await db.execute(
        "SELECT version,updated_at FROM students WHERE id=? LIMIT 1",
        [id],
      );
      await request("students/status", "PATCH", {
        id,
        expectedVersion: current.version,
        status: "待分配",
      });
      const [timeAfter] = await db.execute(
        "SELECT version,updated_at FROM students WHERE id=? LIMIT 1",
        [id],
      );
      assert.deepEqual(timeAfter, timeBefore);
      await request(
        "students/status",
        "PATCH",
        { id, expectedVersion: current.version - 1, status: "待分配" },
        409,
      );
      passed("三状态/首页人数一致/同状态无副作用/旧版本409");
      // Two real concurrent writes with one shared version; either winner is allowed.
      await assertApprovedDatabase(db);
      const writes = [
        ["update", { ...fixtures[0], id, expectedVersion: current.version }],
        ["status", { id, expectedVersion: current.version, status: "在读" }],
      ];
      const concurrent = await Promise.allSettled(
        writes.map(async ([action, body]) => {
          await assertApprovedDatabase(db);
          recovery.before(body);
          try {
            const response = await fetch(base + "/api/students/" + action, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(15000),
            });
            const data = await response.json();
            if (response.status === 200) recovery.acknowledge(body, data.data);
            else if (response.status !== 409) recovery.uncertain();
            return response.status;
          } catch {
            recovery.uncertain();
            throw new Error("并发结果不明（已脱敏）");
          }
        }),
      );
      assert.ok(concurrent.every((r) => r.status === "fulfilled"));
      assert.deepEqual(concurrent.map((r) => r.value).sort(), [200, 409]);
      current = await request("students/detail?id=" + id);
      current = await request("students/status", "PATCH", {
        id,
        expectedVersion: current.version,
        status: "待分配",
      });
      const full = {
        ...fixtures[0],
        school: "校".repeat(128),
        className: "班".repeat(32),
        guardianName: "𠮷".repeat(64),
        guardianPhone: "+00 (000) 000-000",
        note: "𠮷".repeat(500),
        gender: "男",
        enrolledAt: "1900-01-01",
      };
      current = await request("students/update", "PATCH", {
        ...full,
        id,
        expectedVersion: current.version,
      });
      const edit = await request("students/edit?id=" + id);
      assert.equal(edit.guardianPhone, full.guardianPhone);
      assert.notEqual(current.guardianPhoneMasked, full.guardianPhone);
      const list = await request(
        "students/list?keyword=" + encodeURIComponent(fixtures[0].name),
      );
      assert.ok(
        list.items.every(
          (item) =>
            !Object.hasOwn(item, "guardianPhone") &&
            !Object.hasOwn(item, "guardianPhoneMasked"),
        ),
      );
      const options = await request(
        "students/options?keyword=" + encodeURIComponent(fixtures[0].name),
      );
      assert.ok(options.items.some((item) => item.id === id));
      await request("students/update", "PATCH", {
        ...fixtures[0],
        id,
        expectedVersion: current.version,
      });
      passed("真实并发409/完整字段Unicode上界/编辑明文隔离/列表与选择器");
      // Isolated transaction only on the S7 fixture; CHECK and forced rollback.
      const [rowBefore] = await db.execute(
        "SELECT * FROM students WHERE id=? LIMIT 1",
        [id],
      );
      await assertApprovedDatabase(db);
      await db.beginTransaction();
      try {
        await assertApprovedDatabase(db);
        await assert.rejects(
          db.execute("UPDATE students SET version=0 WHERE id=?", [id]),
        );
        await assertApprovedDatabase(db);
        await db.execute("UPDATE students SET note=? WHERE id=?", [
          "S7回滚内临时值",
          id,
        ]);
      } finally {
        await db.rollback();
      }
      const [rowAfter] = await db.execute(
        "SELECT * FROM students WHERE id=? LIMIT 1",
        [id],
      );
      assert.deepEqual(rowAfter, rowBefore);
      passed("真实CHECK与事务回滚无残留");
      await request("students/list?page=0", "GET", undefined, 400);
      const emptyPage = await request("students/list?page=9999");
      assert.equal(emptyPage.items.length, 0);
      const injection = await request(
        "students/list?keyword=" + encodeURIComponent("%' OR 1=1_!"),
      );
      assert.equal(injection.total, 0);
      for (const studentId of ids) {
        const detail = await request("students/detail?id=" + studentId);
        assert.equal(detail.status, "待分配");
        assert.equal(detail.owner, null);
        assert.deepEqual(detail.subjects, []);
        assert.deepEqual(detail.plans, []);
        assert.equal(detail.lastFollowUp, null);
        const records = await request(
          "learning-records/list?studentId=" + studentId,
        );
        assert.equal(records.total, 0);
        const tasks = await request(
          "task-assignments/list?studentId=" + studentId,
        );
        assert.equal(tasks.total, 0);
      }
      const directory = await request("students/list?pageSize=100");
      const studentNames = new Map(
        directory.items.map((item) => [item.id, item.name]),
      );
      for (const path of [
        "contracts/list?pageSize=100",
        "task-assignments/list?pageSize=100",
      ]) {
        const page = await request(path);
        assert.ok(
          page.items.every(
            (item) => item.studentName === studentNames.get(item.studentId),
          ),
          "关联查询学生名称不一致",
        );
      }
      passed("合同与任务分配只读名称和学生目录一致");
      const final = await readRows();
      assert.equal(
        final.length,
        initial.some((row) => row.name === fixtureNames[2]) ? 4 : 3,
      );
      assert.deepEqual(await profileBoundary(db), before);
      const [versions] = await db.execute(
        "SELECT COUNT(*) AS total FROM students WHERE name NOT IN (?,?,?) AND version<>1 LIMIT 1",
        fixtureNames,
      );
      assert.equal(Number(versions[0].total), 0);
      passed("空关联/分页注入/原12学生与关联表及旧台账未变");
    },
    () => recovery.restore(),
    async () => {
      await assertApprovedDatabase(db);
      const [after] = await db.query(
        "SELECT * FROM students ORDER BY id LIMIT 17",
      );
      assert.equal(after.length, 16, "最终学生数量不匹配，请人工核对");
      for (const original of allBefore) {
        const row = after.find(
          (item) => String(item.id) === String(original.id),
        );
        assert.ok(row, "样例或原学生缺失");
        if (String(row.id) === "13") {
          assert.deepEqual(
            { ...profileState(row), version: 0 },
            { ...profileState(original), version: 0 },
            "固定样例未恢复，请人工核对",
          );
          assert.ok(row.version >= original.version);
        } else
          assert.deepEqual(row, original, "非本次写入对象发生变化，请人工核对");
      }
      assert.deepEqual(
        await profileBoundary(db),
        before,
        "关联表或台账核对失败",
      );
    },
  );
  console.log(
    JSON.stringify({
      PASS: pass.length,
      SKIP: skip.length,
      fixedStudents: initial.length,
      firstCreateSkipped: skip,
    }),
  );
});
