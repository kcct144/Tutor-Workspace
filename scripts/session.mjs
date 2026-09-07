import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import {
  LocalSessionError,
  localSessionBaseUrl,
  localSessionStore,
  sessionCookieHeader,
} from "./lib/local-session.mjs";

const baseUrl = () =>
  localSessionBaseUrl(
    process.env.STUDENT_DATA_BASE_URL || "http://127.0.0.1:3000",
  );

const safeMessages = {
  INVALID_COMMAND: "命令无效；可使用 login、whoami、logout 或 clear。",
  TTY_REQUIRED: "登录只能在本机交互式终端运行。",
  LOGIN_FAILED: "登录未成功；请核对账号和密码后重新登录。",
  SESSION_REQUIRED:
    "未找到本机登录会话；请运行 node scripts/session.mjs login。",
  SESSION_EXPIRED:
    "本机会话已失效、退出或安全校验已更新；请运行 node scripts/session.mjs login。",
  SESSION_ENDPOINT_MISMATCH:
    "本机会话绑定的本机服务地址不同；请在目标地址重新登录。",
  SESSION_STORAGE_UNAVAILABLE:
    "本机会话安全存储不可用；请检查当前系统用户的本地应用数据目录权限。",
  LOCAL_ENDPOINT_REQUIRED: "只允许无凭据、无路径的本机回环 HTTP 地址。",
  SERVICE_UNAVAILABLE: "本机服务不可用；请核对监听地址和端口。",
  UNEXPECTED_RESPONSE: "服务响应不符合认证契约，已停止。",
  LOGOUT_UNCONFIRMED:
    "无法确认服务端退出结果；本机状态仍保留，禁止自动重试。可在确认后运行 clear 仅清除本地状态。",
};

function requireLocalTerminal() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new LocalSessionError("TTY_REQUIRED");
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
      stdin.off("error", onError);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onError = () => done(new LocalSessionError("TTY_REQUIRED"));
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003")
          return done(new LocalSessionError("TTY_REQUIRED"));
        if (character === "\r" || character === "\n") return done();
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    stdin.on("error", onError);
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function jsonResponse(response) {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 32 * 1024)
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  try {
    return JSON.parse(text);
  } catch {
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  }
}

function setCookieValue(headers, name) {
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const first = value.split(";", 1)[0];
    const prefix = `${name}=`;
    if (!first.startsWith(prefix)) continue;
    const token = first.slice(prefix.length);
    if (/^[A-Za-z0-9_-]{32,128}$/.test(token)) return token;
  }
  throw new LocalSessionError("UNEXPECTED_RESPONSE");
}

function safeIdentity(data) {
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.username !== "string" ||
    typeof data.name !== "string" ||
    !["admin", "advisor"].includes(data.role)
  )
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  return { username: data.username, name: data.name, role: data.role };
}

async function request(fetcher, url, init) {
  try {
    return await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new LocalSessionError("SERVICE_UNAVAILABLE");
  }
}

export async function loginLocalSession(options) {
  const origin = localSessionBaseUrl(options.baseUrl);
  if (
    typeof options.username !== "string" ||
    !options.username ||
    typeof options.password !== "string" ||
    !options.password
  )
    throw new LocalSessionError("LOGIN_FAILED");
  const response = await request(
    options.fetcher ?? fetch,
    `${origin}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        username: options.username,
        password: options.password,
      }),
    },
  );
  const payload = await jsonResponse(response);
  if (!response.ok || payload?.status !== "ok") {
    if (response.status === 401) throw new LocalSessionError("LOGIN_FAILED");
    if (response.status >= 500)
      throw new LocalSessionError("SERVICE_UNAVAILABLE");
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  }
  const state = {
    baseUrl: origin,
    sessionToken: setCookieValue(response.headers, "tws_session"),
    csrfToken: setCookieValue(response.headers, "tws_csrf"),
  };
  await (options.store ?? localSessionStore).save(state);
  return safeIdentity(payload.data);
}

export async function authenticatedRequest(options) {
  const origin = localSessionBaseUrl(options.baseUrl);
  const store = options.store ?? localSessionStore;
  const state = await store.load(origin);
  const write = options.method !== "GET";
  const response = await request(
    options.fetcher ?? fetch,
    `${origin}${options.path}`,
    {
      method: options.method,
      headers: {
        Cookie: sessionCookieHeader(state),
        ...(write ? { Origin: origin, "X-CSRF-Token": state.csrfToken } : {}),
      },
    },
  );
  const payload = await jsonResponse(response);
  const code = payload?.data?.code;
  if (response.status === 401 && code === "UNAUTHENTICATED") {
    await store.clear();
    throw new LocalSessionError("SESSION_EXPIRED");
  }
  if (response.status === 403 && code === "CSRF_INVALID") {
    await store.clear();
    throw new LocalSessionError("SESSION_EXPIRED");
  }
  if (response.status >= 500)
    throw new LocalSessionError("SERVICE_UNAVAILABLE");
  if (!response.ok || payload?.status !== "ok")
    throw new LocalSessionError("UNEXPECTED_RESPONSE");
  return payload.data;
}

export async function command(argv, options = {}) {
  const [action = "help", ...rest] = argv;
  if (
    rest.length ||
    !["login", "whoami", "logout", "clear", "help"].includes(action)
  )
    throw new LocalSessionError("INVALID_COMMAND");
  if (action === "help") return { action: "help" };
  const origin = options.baseUrl ?? baseUrl();
  const store = options.store ?? localSessionStore;
  const fetcher = options.fetcher ?? fetch;
  if (action === "login") {
    const username = options.username ?? (await readHidden("账号："));
    const password = options.password ?? (await readHidden("密码："));
    const identity = await loginLocalSession({
      baseUrl: origin,
      username,
      password,
      store,
      fetcher,
    });
    return { action, identity };
  }
  if (action === "clear") {
    const cleared = await store.clear();
    return { action, cleared };
  }
  if (action === "whoami") {
    const identity = safeIdentity(
      await authenticatedRequest({
        baseUrl: origin,
        path: "/api/auth/me",
        method: "GET",
        store,
        fetcher,
      }),
    );
    return { action, identity };
  }
  try {
    await authenticatedRequest({
      baseUrl: origin,
      path: "/api/auth/logout",
      method: "POST",
      store,
      fetcher,
    });
  } catch (error) {
    if (error instanceof LocalSessionError && error.code === "SESSION_EXPIRED")
      return { action, cleared: true };
    if (
      error instanceof LocalSessionError &&
      error.code === "SERVICE_UNAVAILABLE"
    )
      throw new LocalSessionError("LOGOUT_UNCONFIRMED");
    throw error;
  }
  await store.clear();
  return { action, cleared: true };
}

function printHelp() {
  console.log("用法：node scripts/session.mjs <login|whoami|logout|clear>");
  console.log(
    "login 仅在本机 TTY 隐藏读取账号和密码；不会读取命令参数、.env 或环境变量。",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await command(process.argv.slice(2));
    if (result.action === "help") printHelp();
    else if (result.action === "login")
      console.log(
        `登录成功：${result.identity.username}（${result.identity.role}）。`,
      );
    else if (result.action === "whoami")
      console.log(
        `当前登录：${result.identity.username}（${result.identity.role}）。`,
      );
    else if (result.action === "logout") console.log("已退出并清除本机会话。");
    else
      console.log(
        result.cleared ? "已清除本机会话。" : "本机没有可清除的会话。",
      );
  } catch (error) {
    const code =
      error instanceof LocalSessionError ? error.code : "SERVICE_UNAVAILABLE";
    console.error(safeMessages[code] ?? safeMessages.SERVICE_UNAVAILABLE);
    process.exitCode = 1;
  }
}
