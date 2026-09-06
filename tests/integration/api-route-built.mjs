import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { runDatabaseCommand } from "../../database/connection.mjs";

// Existing runtime configuration loader, no environment output or file changes.
await runDatabaseCommand(async () => {
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
    },
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    const base = "http://127.0.0.1:" + port;
    let ready = false;
    for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt++) {
      try {
        ready =
          (
            await fetch(base + "/api/independent-audit-missing", {
              signal: AbortSignal.timeout(1000),
            })
          ).status === 404;
      } catch {
        /* Own loopback process starting. */
      }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, "构建服务未就绪");
    process.env.AUDIT_API_BASE_URL = base;
    await import("./api-route-boundary.mjs");
  } finally {
    if (child.exitCode === null) {
      const ended = once(child, "exit");
      child.kill();
      await ended;
    }
  }
  console.log("构建产物D01只读HTTP验证通过，临时进程已关闭。");
});
