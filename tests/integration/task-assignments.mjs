import assert from "node:assert/strict";
import { runDatabaseCommand } from "../../database/connection.mjs";
import {
  assignmentContext,
  verifyAssignments,
  s6ProtectedSnapshot,
} from "../../database/seeds/assignment-fixtures.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { inTransaction } from "../../server/db/pool.ts";
import { shanghaiToday } from "../../server/db/contracts-rules.ts";
import { scenarioResults } from "./scenario-results.mjs";
const readOnly = process.argv.includes("--read-only");
assert.ok(
  process.argv.slice(2).every((arg) => arg === "--read-only"),
  "未知测试参数，停止执行",
);
const writeSkip = readOnly ? "本轮只读，不执行写入" : "";
const results = scenarioResults();
const base = new URL(process.env.S6_API_BASE_URL || "http://127.0.0.1:3001");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
)
  throw new Error("仅允许本机服务。");
await runDatabaseCommand(async (db) => {
  const context = await assignmentContext(db),
    before = await s6ProtectedSnapshot(db);
  let phase = "前置";
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "s6:assignment-fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  async function request(path, method = "GET", body, expected = 200) {
    if (method !== "GET") {
      assert.ok(!readOnly, "只读模式禁止HTTP写请求");
      await assertApprovedDatabase(db);
    }
    const response = await fetch(new URL("/api/" + path, base), {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== expected)
      console.error(
        "S6 " + phase + " HTTP预期" + expected + "实际" + response.status,
      );
    assert.equal(response.status, expected);
    const value = await response.json();
    assert.equal(value.status, expected < 300 ? "ok" : "error");
    assert.match(response.headers.get("cache-control"), /no-store/);
    return value.data;
  }
  const list = (query = "") => request("task-assignments/list" + query);
  const batch = (body, expected = 201) =>
    request("task-assignments/create-batch", "POST", body, expected);
  const completion = (row, completed, expected = 200) =>
    request(
      "task-assignments/completion",
      "PATCH",
      { id: row.id, completed, expectedVersion: row.version },
      expected,
    );
  const today = shanghaiToday(),
    dueDate = "2099-12-31";
  const body = {
    taskId: context.taskIds[0],
    studentIds: [context.studentIds[1]],
    dueDate,
  };
  const count = async () =>
    Number(
      (
        await db.execute("SELECT COUNT(*) AS n FROM task_assignments LIMIT 1")
      )[0][0].n,
    );
  try {
    const assignmentsBefore = await verifyAssignments(db, context);
    const [timesBefore] = await db.execute(
      "SELECT id,created_at,updated_at FROM task_assignments ORDER BY id LIMIT 15",
    );
    const tables = (await db.query("SHOW TABLES"))[0]
      .map((row) => Object.values(row)[0])
      .sort();
    assert.deepEqual(
      tables,
      [
        "users",
        "students",
        "schema_migrations",
        "contracts",
        "student_learning_records",
        "study_plan_documents",
        "study_plan_students",
        "tasks",
        "task_assignments",
      ].sort(),
    );
    phase = "非法输入";
    const initial = await count();
    await results.run(
      "写入输入校验/不存在对象/整批拒绝",
      writeSkip,
      async () => {
        for (const invalid of [
          { ...body, studentIds: [] },
          {
            ...body,
            studentIds: Array.from({ length: 101 }, (_, i) => String(i + 1)),
          },
          {
            ...body,
            studentIds: [context.studentIds[1], context.studentIds[1]],
          },
          { ...body, dueDate: "2000-01-01" },
          { ...body, assignedBy: context.actor },
          { ...body, actorId: context.actor },
          { ...body, dueDate: today + "x" },
        ])
          await batch(invalid, 400);
        await batch({ ...body, taskId: context.disabledId }, 409);
        await batch({ ...body, taskId: "18446744073709551615" }, 404);
        await batch({ ...body, studentIds: ["18446744073709551615"] }, 404);
        await batch(
          {
            ...body,
            studentIds: Array.from({ length: 100 }, (_, i) => String(i + 1)),
          },
          404,
        );
        await batch(
          {
            ...body,
            studentIds: [context.studentIds[0], context.studentIds[1]],
          },
          409,
        );
        assert.equal(await count(), initial);
      },
    );
    await results.run("只读非法查询/分页/关键词", "", async () => {
      for (const query of [
        "?page=0",
        "?pageSize=101",
        "?status=cancelled",
        "?dueState=invalid",
        "?studentId=1x",
        "?today=2000-01-01",
      ])
        await request("task-assignments/list" + query, "GET", undefined, 400);
      assert.equal(
        (await list("?keyword=" + encodeURIComponent("%' OR 1=1 --"))).total,
        0,
      );
      assert.equal((await list("?page=99999")).items.length, 0);
      const firstPage = await list();
      assert.equal(firstPage.pageSize, 8);
      assert.equal(firstPage.items.length, 8);
      assert.equal(firstPage.total, initial);
    });
    await results.run("完成接口不存在ID", writeSkip, async () => {
      await request(
        "task-assignments/completion",
        "PATCH",
        { id: "18446744073709551615", completed: true, expectedVersion: 1 },
        404,
      );
    });
    phase = "固定批量与并发";
    let rows = await verifyAssignments(db, context);
    const has = (task, student) =>
      rows.some(
        (row) =>
          String(row.task_id) === task && String(row.student_id) === student,
      );
    await results.run(
      "首次2人批量创建",
      has(context.taskIds[0], context.studentIds[6])
        ? "固定样例已存在"
        : writeSkip,
      async () => {
        const result = await batch({
          ...body,
          studentIds: [context.studentIds[6], context.studentIds[7]],
          dueDate: today,
        });
        assert.equal(result.createdCount, 2);
        assert.equal(result.assignmentIds.length, 2);
      },
    );
    await results.run(
      "首次并发创建201/409",
      has(context.taskIds[1], context.studentIds[10])
        ? "固定样例已存在"
        : writeSkip,
      async () => {
        const input = {
          ...body,
          taskId: context.taskIds[1],
          studentIds: [context.studentIds[10]],
        };
        await assertApprovedDatabase(db);
        const responses = await Promise.all(
          [0, 1].map(() =>
            fetch(new URL("/api/task-assignments/create-batch", base), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      },
    );
    await results.run(
      "首次1人创建",
      has(context.taskIds[1], context.studentIds[11])
        ? "固定样例已存在"
        : writeSkip,
      async () => {
        assert.equal(
          (
            await batch({
              ...body,
              taskId: context.taskIds[1],
              studentIds: [context.studentIds[11]],
            })
          ).createdCount,
          1,
        );
      },
    );
    phase = "完成与乐观锁";
    await results.run(
      "完成/恢复/同目标/版本及并发冲突",
      writeSkip,
      async () => {
        let record = (await list("?studentId=" + context.studentIds[11]))
          .items[0];
        if (record.status === "completed")
          record = await completion(record, false);
        const unchanged = await completion(record, false);
        assert.deepEqual(unchanged, record);
        const complete = await completion(record, true);
        assert.ok(complete.completedAt);
        assert.equal(complete.dueState, null);
        await completion(record, true, 409);
        const restored = await completion(complete, false);
        assert.equal(restored.completedAt, null);
        await assertApprovedDatabase(db);
        const responses = await Promise.all(
          [0, 1].map(() =>
            fetch(new URL("/api/task-assignments/completion", base), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: restored.id,
                completed: true,
                expectedVersion: restored.version,
              }),
            }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        record = (await list("?studentId=" + context.studentIds[11])).items[0];
        await completion(record, false);
        const first = (
          await list("?studentId=" + context.studentIds[0] + "&pageSize=100")
        ).items;
        const history = first.find(
          (row) =>
            row.status === "completed" && row.taskId === context.taskIds[0],
        );
        await completion(history, false, 409);
        assert.deepEqual(
          (
            await list("?studentId=" + context.studentIds[0] + "&pageSize=100")
          ).items.find((row) => row.id === history.id),
          history,
        );
        await request(
          "task-assignments/completion",
          "PATCH",
          {
            id: history.id,
            completed: false,
            expectedVersion: history.version,
            actorId: context.actor,
          },
          400,
        );
      },
    );
    phase = "数据库约束与事务回滚";
    await results.run("FK/CHECK/唯一约束/事务回滚", writeSkip, async () => {
      const preTransaction = await count();
      const insert =
        "INSERT INTO task_assignments(task_id,student_id,assigned_by,status,due_date,completed_at,version) VALUES(?,?,?,?,?,?,?)";
      const values = [
        context.taskIds[0],
        context.studentIds[1],
        context.actor,
        "pending",
        today,
        null,
        1,
      ];
      const sentinel = new Error("expected rollback");
      await assert.rejects(
        inTransaction(db, async () => {
          for (const bad of [
            values.map((v, i) => (i === 0 ? "18446744073709551615" : v)),
            values.map((v, i) => (i === 1 ? "18446744073709551615" : v)),
            values.map((v, i) => (i === 2 ? "18446744073709551615" : v)),
            values.map((v, i) => (i === 3 ? "cancelled" : v)),
            values.map((v, i) => (i === 3 ? "completed" : v)),
            values.map((v, i) => (i === 6 ? 0 : v)),
          ])
            await assert.rejects(executeWrite(db, insert, bad));
          await executeWrite(db, insert, values);
          await assert.rejects(
            executeWrite(db, insert, values),
            (error) => error.code === "ER_DUP_ENTRY",
          );
          await executeWrite(db, insert, [
            ...values.slice(0, 3),
            "completed",
            today,
            today + " 00:00:00.000",
            1,
          ]);
          throw sentinel;
        }),
        (error) => error === sentinel,
      );
      assert.equal(await count(), preTransaction);
    });
    phase = "聚合与安全投影";
    await results.run(
      "只读当前定义JOIN/首页计数/人数去重/安全投影",
      "",
      async () => {
        const all = await list("?pageSize=100"),
          home = await request("home/list");
        const [active] = await db.execute(
          "SELECT COUNT(*) AS n FROM students WHERE status='在读' LIMIT 1",
        );
        assert.equal(home.activeStudents, Number(active[0].n));
        assert.equal(home.total, home.activeStudents);
        for (const card of home.items) {
          const relevant = all.items.filter((row) => row.studentId === card.id),
            pending = relevant.filter((row) => row.status === "pending"),
            completed = relevant.filter((row) => row.status === "completed");
          assert.equal(card.pendingCount, pending.length);
          assert.equal(card.completedCount, completed.length);
          assert.equal(card.pendingRemaining, Math.max(0, pending.length - 3));
          assert.equal(
            card.completedRemaining,
            Math.max(0, completed.length - 3),
          );
          assert.ok(
            card.pendingTasks.length <= 3 && card.completedTasks.length <= 3,
          );
          for (const row of [...card.pendingTasks, ...card.completedTasks])
            assert.deepEqual(
              row,
              relevant.find((item) => item.id === row.id),
            );
        }
        const card = home.items.find((row) => row.id === context.studentIds[0]);
        assert.equal(card.completedRemaining, 2);
        const filtered = await request(
          "home/list?grade=" + encodeURIComponent(card.grade),
        );
        assert.equal(filtered.activeStudents, home.activeStudents);
        assert.ok(filtered.items.every((row) => row.grade === card.grade));
        for (const task of (await request("tasks/list?pageSize=100")).items) {
          assert.equal(
            task.assignmentCount,
            new Set(
              all.items
                .filter((row) => row.taskId === task.id)
                .map((row) => row.studentId),
            ).size,
          );
          for (const row of all.items.filter((row) => row.taskId === task.id)) {
            assert.equal(row.taskTitle, task.title);
            assert.equal(row.subject, task.subject);
            assert.equal(row.description, task.description);
          }
        }
        assert.equal(
          (await list("?status=completed&dueState=overdue")).total,
          0,
        );
        assert.ok(
          (await list("?dueState=overdue")).items.every(
            (row) => row.status === "pending" && row.dueDate < today,
          ),
        );
        assert.ok(
          (
            await list("?subject=" + encodeURIComponent(all.items[0].subject))
          ).items.every((row) => row.subject === all.items[0].subject),
        );
        for (const row of all.items)
          for (const key of Object.keys(row))
            assert.ok(
              ![
                "assignedBy",
                "assigned_by",
                "owner_user_id",
                "guardianPhone",
                "note",
              ].includes(key),
            );
      },
    );
    assert.deepEqual(await s6ProtectedSnapshot(db), before);
    rows = await verifyAssignments(db, context);
    if (readOnly) {
      assert.deepEqual(rows, assignmentsBefore);
      const [timesAfter] = await db.execute(
        "SELECT id,created_at,updated_at FROM task_assignments ORDER BY id LIMIT 15",
      );
      assert.deepEqual(timesAfter, timesBefore);
    }
    results.summary();
    console.log(
      "固定分配总数=" +
        rows.length +
        "，S1–S5指纹未变。" +
        (readOnly
          ? "只读模式：分配全字段也未变化。"
          : "100人真实成功未验证；本轮仅验证含不存在学生时整批拒绝。"),
    );
  } catch (error) {
    console.error("S6停止阶段：" + phase);
    throw error;
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["s6:assignment-fixtures"]);
  }
});
