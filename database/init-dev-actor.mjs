import { runDatabaseCommand } from "./connection.mjs";
import { assertApprovedDatabase } from "../server/db/safety.ts";
import { fileURLToPath } from "node:url";

/** Reserved synthetic label. It is not a login account or a real person. */
export const DEV_ACTOR_NAME = "本机合成操作人";
const lockName = "tutor_workspace:dev-actor:init";

export function parseInitArguments(argv) {
  if (argv.length === 1 && argv[0] === "--help")
    return { help: true, apply: false };
  if (argv.some((value) => !["--apply", "--confirm"].includes(value)))
    throw new Error("初始化参数无效。");
  const apply = argv.includes("--apply");
  if (apply !== argv.includes("--confirm"))
    throw new Error("写入必须同时包含 --apply --confirm。");
  return { help: false, apply };
}

export function chooseActorAction(total, matchingIds) {
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(matchingIds))
    throw new Error("人员初始化检查结果无效。");
  if (total === 0) return { action: "create" };
  if (
    total === 1 &&
    matchingIds.length === 1 &&
    /^[1-9]\d*$/.test(matchingIds[0])
  )
    return { action: "reuse", actorId: matchingIds[0] };
  throw new Error("人员表已有未知或不匹配数据；未写入。\n");
}

async function inspect(connection) {
  await assertApprovedDatabase(connection);
  const [countRows] = await connection.query({
    sql: "SELECT COUNT(*) AS total FROM users LIMIT 1",
    timeout: 10000,
  });
  const [matchingRows] = await connection.execute(
    {
      sql: "SELECT id FROM users WHERE name = ? ORDER BY id LIMIT 2",
      timeout: 10000,
    },
    [DEV_ACTOR_NAME],
  );
  return chooseActorAction(
    Number(countRows[0]?.total),
    matchingRows.map((row) => String(row.id)),
  );
}

export async function initializeDevActor(connection, apply) {
  if (!apply) return inspect(connection);
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK(?, 0) AS acquired",
    [lockName],
  );
  if (Number(lockRows[0]?.acquired) !== 1)
    throw new Error("未取得本机操作人初始化锁；未写入。\n");
  try {
    await connection.beginTransaction();
    try {
      const plan = await inspect(connection);
      let actorId = plan.actorId;
      if (plan.action === "create") {
        await assertApprovedDatabase(connection);
        const [inserted] = await connection.execute(
          "INSERT INTO users (name) VALUES (?)",
          [DEV_ACTOR_NAME],
        );
        actorId = String(inserted.insertId);
        const [verified] = await connection.execute(
          "SELECT id FROM users WHERE name = ? ORDER BY id LIMIT 2",
          [DEV_ACTOR_NAME],
        );
        if (verified.length !== 1 || String(verified[0]?.id) !== actorId)
          throw new Error("本机操作人写后核对未通过。\n");
      }
      await assertApprovedDatabase(connection);
      await connection.commit();
      return { ...plan, actorId };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    }
  } finally {
    await connection
      .execute("SELECT RELEASE_LOCK(?)", [lockName])
      .catch(() => {});
  }
}

function printHelp() {
  console.log("用法：node database/init-dev-actor.mjs [--apply --confirm]");
  console.log(
    "默认只检查；仅在 users 为空时，--apply --confirm 创建一个本机合成操作人。",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseInitArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    await runDatabaseCommand(async (connection) => {
      const result = await initializeDevActor(connection, args.apply);
      if (!args.apply) {
        console.log(
          result.action === "create"
            ? "预检通过：人员表为空；可显式初始化1名本机合成操作人。"
            : "预检通过：已存在唯一的本机合成操作人；无需写入。",
        );
        return;
      }
      console.log(
        result.action === "create"
          ? "本机合成操作人已创建。"
          : "本机合成操作人已复用；未写入。",
      );
      console.log("请仅在本机私下填写 DEV_ACTOR_ID：" + result.actorId);
    });
  }
}
