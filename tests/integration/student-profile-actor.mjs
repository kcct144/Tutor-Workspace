import {
  safeAssert as assert,
  boundedDatabase,
  runWithRecovery,
} from "./student-profile-recovery.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { runDatabaseCommand } from "../../database/connection.mjs";
import { assertApprovedDatabase } from "../../server/db/safety.ts";
import { profileBoundary } from "./student-profile-boundary.mjs";
await runDatabaseCommand(async (db) => {
  db = boundedDatabase(db);
  const before = await profileBoundary(db);
  const [students] = await db.query(
    "SELECT * FROM students ORDER BY id LIMIT 100",
  );
  const fixture = students.find((row) => row.name === "S7固定最小档案");
  assert.equal(students.length, 16, "必须为既有16名学生，禁止创建样例");
  assert.ok(
    fixture &&
      String(fixture.id) === "13" &&
      fixture.status === "待分配" &&
      fixture.school === null &&
      fixture.class_name === null &&
      fixture.note === null &&
      fixture.guardian_phone === null &&
      fixture.guardian_name === null &&
      fixture.gender === null &&
      fixture.enrolled_at === null &&
      fixture.owner_user_id === null &&
      fixture.grade === "初一",
    "最小样例不匹配，停止",
  );
  const duplicate = students.find((row) => String(row.id) === "14");
  assert.ok(
    duplicate?.name === "S7固定重复档案" &&
      duplicate.school === "S7合成学校" &&
      duplicate.class_name === "S7合成班",
    "重复样例不匹配，停止",
  );
  console.log(
    "操作人测试登记：更新/同状态目标仅id=13；创建使用已存在重复条件且不确认；预算新增0；总数16。",
  );
  await runWithRecovery(
    async () => {
      for (const actor of ["", "18446744073709551615"]) {
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
            DEV_ACTOR_ID: actor,
          },
          stdio: "ignore",
          windowsHide: true,
        });
        try {
          const base = "http://127.0.0.1:" + port;
          let ready = false;
          for (let i = 0; i < 40 && child.exitCode === null; i++) {
            try {
              ready =
                (
                  await fetch(base + "/api/independent-audit-missing", {
                    signal: AbortSignal.timeout(1000),
                  })
                ).status === 404;
            } catch {
              /* loopback startup */
            }
            if (ready) break;
            await delay(100);
          }
          assert.ok(ready, "构建服务未就绪");
          for (const [action, method, body] of [
            [
              "create",
              "POST",
              {
                name: duplicate.name,
                grade: "初一",
                school: duplicate.school,
                className: duplicate.class_name,
              },
            ],
            [
              "update",
              "PATCH",
              {
                id: String(fixture.id),
                expectedVersion: fixture.version,
                name: fixture.name,
                grade: fixture.grade,
              },
            ],
            [
              "status",
              "PATCH",
              {
                id: String(fixture.id),
                expectedVersion: fixture.version,
                status: "待分配",
              },
            ],
          ]) {
            await assertApprovedDatabase(db);
            const response = await fetch(base + "/api/students/" + action, {
              method,
              headers: {
                "Content-Type": "application/json",
                "X-Actor-Id": "1",
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(10000),
            });
            assert.equal(response.status, 503);
            assert.equal(
              (await response.json()).data.code,
              "DEV_ACTOR_UNAVAILABLE",
            );
            assert.equal(response.headers.get("cache-control"), "no-store");
          }
        } finally {
          if (child.exitCode === null) {
            const ended = once(child, "exit", {
              signal: AbortSignal.timeout(5000),
            });
            child.kill();
            await ended;
          }
        }
      }
    },
    async () => {
      // Denial probes submit baseline values only. Never adopt an unexpected success
      // as an authorized write; unconditional reconciliation below must still run.
    },
    async () => {
      await assertApprovedDatabase(db);
      const [after] = await db.query(
        "SELECT * FROM students ORDER BY id LIMIT 100",
      );
      assert.deepEqual(after, students);
      assert.deepEqual(await profileBoundary(db), before);
    },
  );
  console.log(
    "[PASS] 构建API：空/无效DEV_ACTOR三类写入共6项503；伪造头无效；全部学生与关联数据未变；临时服务已关闭。",
  );
});
