import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { runDatabaseCommand } from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import {
  assignmentContext,
  verifyAssignments,
  s6ProtectedSnapshot,
} from "../../database/seeds/assignment-fixtures.mjs";
await runDatabaseCommand(async (db) => {
  const context = await assignmentContext(db),
    before = await verifyAssignments(db, context),
    protectedBefore = await s6ProtectedSnapshot(db);
  for (const actorValue of ["", "18446744073709551615"]) {
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const child = spawn(process.execPath, [".output/server/index.mjs"], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        PORT: String(port),
        NITRO_PORT: String(port),
        DEV_ACTOR_ID: actorValue,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    try {
      let ready = false;
      for (
        let attempt = 0;
        attempt < 40 && child.exitCode === null;
        attempt++
      ) {
        try {
          ready =
            (
              await fetch("http://127.0.0.1:" + port + "/api/home/list", {
                signal: AbortSignal.timeout(1000),
              })
            ).status === 200;
        } catch {
          /* Local test child may still be starting. */
        }
        if (ready) break;
        await delay(100);
      }
      assert.ok(ready, "本机构建测试服务不可用");
      for (const [action, method, body] of [
        [
          "create-batch",
          "POST",
          {
            taskId: context.taskIds[0],
            studentIds: [context.studentIds[1]],
            dueDate: "2099-12-31",
          },
        ],
        [
          "completion",
          "PATCH",
          {
            id: String(before[0].id),
            expectedVersion: before[0].version,
            completed: true,
          },
        ],
      ]) {
        await assertApprovedDatabase(db);
        const response = await fetch(
          "http://127.0.0.1:" + port + "/api/task-assignments/" + action,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              "X-Actor-Id": context.actor,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          },
        );
        assert.equal(response.status, 503);
        assert.equal(
          (await response.json()).data.code,
          "DEV_ACTOR_UNAVAILABLE",
        );
      }
    } finally {
      if (child.exitCode === null) {
        const ended = once(child, "exit");
        child.kill();
        await ended;
      }
    }
  }
  assert.deepEqual(await verifyAssignments(db, context), before);
  assert.deepEqual(await s6ProtectedSnapshot(db), protectedBefore);
  console.log(
    "S6构建产物真实API：空/无效DEV_ACTOR_ID两类写入均503，伪造请求头无效；所有数据未变化，测试子进程已关闭。",
  );
});
