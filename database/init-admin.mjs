import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { runDatabaseCommand } from "./connection.mjs";
import {
  bootstrapInitialAdmin,
  inspectInitialAdmin,
} from "../server/db/auth-accounts.ts";
import {
  AuthValidationError,
  hashPassword,
  normalizeUsername,
  normalizeUserName,
  PasswordHashingUnavailableError,
  validatePassword,
} from "../server/db/auth-rules.ts";
import { positiveId } from "../server/db/contracts-rules.ts";

export function parseInitAdminArguments(argv) {
  if (argv.length === 1 && argv[0] === "--help")
    return { help: true, apply: false };
  if (argv.some((value) => !["--apply", "--confirm"].includes(value)))
    throw new Error("初始化参数无效。");
  const apply = argv.includes("--apply");
  if (apply !== argv.includes("--confirm"))
    throw new Error("写入必须同时包含 --apply --confirm。");
  return { help: false, apply };
}

export class BootstrapInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "BootstrapInputError";
  }
}

export function validateBootstrapPassword(
  username,
  password,
  repeatedPassword,
) {
  if (password !== repeatedPassword)
    throw new BootstrapInputError("两次密码输入不一致；未写入。");
  return validatePassword(password, username);
}

/** Returns only messages whose cause is safe for a local interactive operator. */
export function safeBootstrapInputMessage(error) {
  if (error instanceof BootstrapInputError) return error.message;
  if (error instanceof AuthValidationError) return `${error.message}未写入。`;
  if (error instanceof PasswordHashingUnavailableError)
    return `${error.message}未写入。`;
  return null;
}

function requireLocalTerminal() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error("初始管理员引导只能在本机交互式终端运行。");
}

async function readVisible(prompt) {
  requireLocalTerminal();
  stdout.write(prompt);
  stdin.setEncoding("utf8");
  return await new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      const text = String(chunk);
      const end = text.search(/[\r\n]/u);
      if (end >= 0) {
        stdin.off("data", onData);
        resolve((value + text.slice(0, end)).trim());
      } else value += text;
    };
    stdin.once("error", reject);
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function readHidden(prompt) {
  requireLocalTerminal();
  stdout.write(prompt);
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  return await new Promise((resolve, reject) => {
    let value = "";
    const done = (error) => {
      stdin.setRawMode(false);
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          done(new Error("操作已取消。"));
          return;
        }
        if (character === "\r" || character === "\n") {
          done();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    stdin.once("error", done);
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function collectBootstrapInput(userCount) {
  const username = normalizeUsername(await readVisible("管理员账号："));
  const password = await readHidden("管理员密码：");
  const repeatedPassword = await readHidden("再次输入密码：");
  validateBootstrapPassword(username, password, repeatedPassword);
  if (userCount === 0) {
    const newUserName = normalizeUserName(await readVisible("人员姓名："));
    return {
      newUserName,
      username,
      passwordHash: await hashPassword(password),
    };
  }
  const existingUserId = positiveId(
    await readVisible("绑定既有人员 ID（不显示人员列表）："),
  );
  return {
    existingUserId,
    username,
    passwordHash: await hashPassword(password),
  };
}

function printHelp() {
  console.log("用法：pnpm db:init-admin -- --apply --confirm");
  console.log(
    "仅本机交互式终端可运行；不会读取 DEV_ACTOR_ID 或 .env 之外的凭据。",
  );
  console.log("默认只做批准库与启用管理员预检；写入时仅通过隐藏输入读取密码。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseInitAdminArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    await runDatabaseCommand(async (connection) => {
      const inspection = await inspectInitialAdmin(connection);
      if (inspection.enabledAdminCount > 0)
        throw new Error("已存在启用管理员；未写入。");
      if (!args.apply) {
        console.log(
          inspection.userCount === 0
            ? "预检通过：人员表为空；写入时将交互创建人员和初始管理员。"
            : "预检通过：请在写入时手工输入既有人员 ID 以绑定初始管理员。",
        );
        return;
      }
      let input;
      try {
        input = await collectBootstrapInput(inspection.userCount);
      } catch (error) {
        const message = safeBootstrapInputMessage(error);
        if (!message) throw error;
        console.error(message);
        process.exitCode = 1;
        return;
      }
      const result = await bootstrapInitialAdmin(connection, input);
      console.log(
        result.createdUser
          ? "初始管理员已创建并完成审计登记。"
          : "初始管理员已绑定既有人员并完成审计登记。",
      );
    });
  }
}
