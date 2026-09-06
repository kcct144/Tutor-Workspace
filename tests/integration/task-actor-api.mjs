import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { runDatabaseCommand } from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import {
  taskActor,
  verifyTasks,
  protectedSnapshot,
} from "../../database/seeds/task-fixtures.mjs";
// Built Nitro process only, loopback, controlled env override; never alter .env.
await runDatabaseCommand(async (db) => {
  const actor = await taskActor(db);
  const before = await verifyTasks(db, actor);
  const protectedBefore = await protectedSnapshot(db);
  for (const actorValue of ["", "18446744073709551615"]) {
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    const port = address.port;
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
              await fetch("http://127.0.0.1:" + port + "/api/tasks/list", {
                signal: AbortSignal.timeout(1000),
              })
            ).status === 200;
        } catch {
          // Local child may not have bound its port yet; never print driver/config details.
        }
        if (ready) break;
        await delay(100);
      }
      assert.ok(ready, "Built local test server unavailable");
      for (const [action, method, body] of [
        [
          "create",
          "POST",
          { title: "不会持久化", subject: "合成", description: "拒绝测试" },
        ],
        [
          "update",
          "PATCH",
          {
            id: String(before[0].id),
            expectedVersion: before[0].version,
            title: before[0].title,
            subject: before[0].subject,
            description: before[0].description,
            status: before[0].status,
          },
        ],
        [
          "status",
          "PATCH",
          {
            id: String(before[0].id),
            expectedVersion: before[0].version,
            status: "disabled",
          },
        ],
      ]) {
        await assertApprovedDatabase(db);
        const response = await fetch(
          "http://127.0.0.1:" + port + "/api/tasks/" + action,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              "X-Actor-Id": actor,
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
  assert.deepEqual(await verifyTasks(db, actor), before);
  assert.deepEqual(await protectedSnapshot(db), protectedBefore);
  console.log(
    "S5构建产物真实API：缺失/不存在DEV_ACTOR_ID的三类写入均503，伪造请求头无效，任务及S1–S4无变化；测试子进程已关闭。",
  );
});
