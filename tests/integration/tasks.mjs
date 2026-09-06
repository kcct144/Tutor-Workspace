import assert from "node:assert/strict";
import {
  runDatabaseCommand,
  openDatabase,
} from "../../database/connection.mjs";
import {
  taskActor,
  verifyTasks,
  apiTask,
  protectedSnapshot,
} from "../../database/seeds/task-fixtures.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { executeWrite } from "../../server/db/write.ts";
import { inTransaction } from "../../server/db/pool.ts";
const base = new URL(process.env.S5_API_BASE_URL || "http://127.0.0.1:3001");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
)
  throw new Error("仅允许本机服务。");
await runDatabaseCommand(async (db) => {
  const actor = await taskActor(db);
  const [lock] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [
    "tutor_workspace:s5:fixtures",
  ]);
  assert.equal(Number(lock[0].acquired), 1);
  let phase = "前置";
  async function request(path, method = "GET", body, expected = 200) {
    if (method !== "GET") await assertApprovedDatabase(db);
    const response = await fetch(new URL("/api/tasks/" + path, base), {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== expected)
      console.error(
        "S5 " + phase + " HTTP预期" + expected + "实际" + response.status,
      );
    assert.equal(response.status, expected);
    const value = await response.json();
    assert.equal(value.status, expected < 300 ? "ok" : "error");
    assert.match(response.headers.get("cache-control"), /no-store/);
    return value.data;
  }
  const detail = (id) => request("detail?id=" + id);
  // S6 now supplies real counts. This script still writes S5 fixtures and needs
  // separate authority when the active slice forbids changing existing tasks.
  const assignmentCount = async (id) =>
    Number(
      (
        await db.execute(
          "SELECT COUNT(DISTINCT student_id) AS n FROM task_assignments WHERE task_id=? LIMIT 1",
          [id],
        )
      )[0][0].n,
    );
  const update = (task, changes = {}, expected = 200) =>
    request(
      "update",
      "PATCH",
      {
        id: task.id,
        expectedVersion: task.version,
        title: task.title,
        subject: task.subject,
        description: task.description,
        status: task.status,
        ...changes,
      },
      expected,
    );
  const setStatus = (task, status, expected = 200) =>
    request(
      "status",
      "PATCH",
      { id: task.id, expectedVersion: task.version, status },
      expected,
    );
  try {
    let fixtures = await verifyTasks(db, actor);
    const before = await protectedSnapshot(db);
    const [tables] = await db.query("SHOW TABLES");
    assert.ok(
      tables.some((row) => Object.values(row).includes("task_assignments")),
    );
    phase = "约束和失败事务";
    const observer = await openDatabase();
    try {
      const [initial] = await observer.execute(
        "SELECT COUNT(*) AS n FROM tasks LIMIT 1",
      );
      const sentinel = new Error("expected rollback");
      await assert.rejects(
        inTransaction(db, async () => {
          const insert =
            "INSERT INTO tasks (owner_user_id,title,subject,description,status,version) VALUES (?,?,?,?,?,?)";
          await executeWrite(db, insert, [
            actor,
            "S5仅事务内",
            "科目",
            "说明",
            "enabled",
            1,
          ]);
          for (const args of [
            ["18446744073709551615", "t", "s", "d", "enabled", 1],
            [actor, "", "s", "d", "enabled", 1],
            [actor, "t", "", "d", "enabled", 1],
            [actor, "t", "s", "", "enabled", 1],
            [actor, "t", "s", "字".repeat(10001), "enabled", 1],
            [actor, "t", "s", "d", "draft", 1],
            [actor, "t", "s", "d", "enabled", 0],
          ])
            await assert.rejects(executeWrite(db, insert, args));
          const [during] = await observer.execute(
            "SELECT COUNT(*) AS n FROM tasks LIMIT 1",
          );
          assert.deepEqual(during, initial);
          throw sentinel;
        }),
        (error) => error === sentinel,
      );
      const [after] = await observer.execute(
        "SELECT COUNT(*) AS n FROM tasks LIMIT 1",
      );
      assert.deepEqual(after, initial);
    } finally {
      await observer.end();
    }
    phase = "输入校验";
    for (const [key, max] of [
      ["title", 160],
      ["subject", 64],
      ["description", 10000],
    ]) {
      for (const val of ["", " \n\t", null, "字".repeat(max + 1)])
        await request("create", "POST", { ...apiTask, [key]: val }, 400);
    }
    for (const field of [
      "owner",
      "owner_user_id",
      "ownerUserId",
      "actor",
      "actorId",
      "version",
      "status",
      "extra",
    ])
      await request("create", "POST", { ...apiTask, [field]: "1" }, 400);
    await request(
      "create",
      "POST",
      { ...apiTask, description: "a".repeat(140000) },
      413,
    );
    for (const query of [
      "page=0",
      "page=-1",
      "page=1.2",
      "pageSize=101",
      "status=draft",
      "keyword=" + "a".repeat(65),
      "subject=",
      "owner=1",
    ])
      await request("list?" + query, "GET", undefined, 400);
    for (const id of ["0", "01", "abc", "18446744073709551616"])
      await request("detail?id=" + id, "GET", undefined, 400);
    await request("detail?id=18446744073709551615", "GET", undefined, 404);
    await request("options?status=disabled", "GET", undefined, 400);
    await request("subjects?pageSize=0", "GET", undefined, 400);
    phase = "固定新增/持久化";
    const existing = fixtures.find((row) => row.title === apiTask.title);
    let task = existing
      ? await detail(String(existing.id))
      : await request("create", "POST", apiTask, 201);
    if (!existing) {
      assert.equal(task.status, "enabled");
      assert.equal(task.version, 1);
    }
    assert.deepEqual(
      Object.keys(task).sort(),
      [
        "id",
        "title",
        "subject",
        "description",
        "status",
        "version",
        "createdAt",
        "updatedAt",
        "assignmentCount",
      ].sort(),
    );
    assert.equal(task.assignmentCount, await assignmentCount(task.id));
    for (const status of ["disabled", "enabled", "disabled"]) {
      task = await setStatus(task, status);
      assert.equal((await detail(task.id)).status, status);
    }
    let options = await request("options?pageSize=100");
    assert.ok(!options.items.some((item) => item.id === task.id));
    task = await setStatus(task, "enabled");
    options = await request("options?pageSize=100");
    assert.ok(options.items.some((item) => item.id === task.id));
    assert.deepEqual(Object.keys(options.items[0]).sort(), [
      "id",
      "subject",
      "title",
    ]);
    for (const status of ["draft", "启用", "disabled ", null])
      await request(
        "status",
        "PATCH",
        { id: task.id, expectedVersion: task.version, status },
        400,
      );
    for (const field of ["owner", "actor", "owner_user_id", "version"])
      await update(task, { [field]: "1" }, 400);
    await update(task, { expectedVersion: 0 }, 400);
    await update(task, { id: "18446744073709551615" }, 404);
    task = await update(task, {
      title: "😀".repeat(160),
      subject: "😀".repeat(64),
      description: "界".repeat(10000),
    });
    assert.equal([...task.title].length, 160);
    assert.equal(task.description.length, 10000);
    task = await update(task, {
      ...apiTask,
      description: " \n" + apiTask.description + "\n ",
    });
    assert.equal(task.description, apiTask.description);
    const stale = task;
    task = await update(task, { description: "S5固定API编辑说明。" });
    await update(stale, {}, 409);
    await setStatus(stale, "disabled", 409);
    phase = "并发版本";
    await assertApprovedDatabase(db);
    const results = await Promise.all(
      ["enabled", "disabled"].map((status) =>
        fetch(new URL("/api/tasks/status", base), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: task.id,
            expectedVersion: task.version,
            status,
          }),
          signal: AbortSignal.timeout(15000),
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    task = await detail(task.id);
    task = await update(task, { ...apiTask, status: "enabled" });
    phase = "分页/搜索/选项";
    const first = await request("list?pageSize=1"),
      second = await request("list?pageSize=1&page=2");
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].id, second.items[0].id);
    const far = await request("list?page=999&pageSize=100");
    assert.equal(far.items.length, 0);
    assert.equal(far.total, first.total);
    assert.equal(
      (await request("list?keyword=" + encodeURIComponent("%' OR 1=1 --_!")))
        .total,
      0,
    );
    assert.equal(
      (await request("list?keyword=" + encodeURIComponent("固定API验收说明")))
        .total,
      1,
    );
    assert.equal(
      (
        await request(
          "list?keyword=" +
            encodeURIComponent("S5固定API") +
            "&subject=" +
            encodeURIComponent(apiTask.subject) +
            "&status=enabled",
        )
      ).total,
      1,
    );
    const disabled = await request("list?status=disabled");
    assert.ok(disabled.items.length);
    for (const item of disabled.items) {
      assert.equal(item.status, "disabled");
      assert.equal(item.assignmentCount, await assignmentCount(item.id));
    }
    const subjects = await request("subjects?pageSize=1"),
      sub2 = await request("subjects?pageSize=1&page=2");
    assert.notEqual(subjects.items[0].value, sub2.items[0].value);
    assert.equal(
      (await request("subjects?keyword=" + encodeURIComponent(apiTask.subject)))
        .total,
      1,
    );
    const opt1 = await request("options?pageSize=1"),
      opt2 = await request("options?pageSize=1&page=2");
    assert.notEqual(opt1.items[0].id, opt2.items[0].id);
    fixtures = await verifyTasks(db, actor);
    assert.equal(fixtures.length, first.total);
    assert.deepEqual(await protectedSnapshot(db), before);
    console.log(
      "S5真实API通过：输入/两态/乐观锁并发/分页筛选/选项/约束事务；S1–S4逐行指纹与台账不变。固定任务" +
        fixtures.length +
        "条，无删除。",
    );
  } catch (error) {
    console.error(
      "S5停止于：" +
        phase +
        "；未输出配置或业务行，已提交固定数据保留，不删除。",
    );
    console.error(
      error.stack
        ?.split("\n")
        .find((line) => line.includes("tests/integration/tasks.mjs"))
        ?.trim() ?? "测试失败",
    );
    throw error;
  } finally {
    await db.execute("SELECT RELEASE_LOCK(?)", ["tutor_workspace:s5:fixtures"]);
  }
});
