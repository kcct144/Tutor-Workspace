import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  LocalSessionError,
  localSessionStore,
  sessionCookieHeader,
} from "./local-session.mjs";

export class ToolError extends Error {
  constructor(code, uncertain = false, candidates) {
    super(code);
    this.code = code;
    this.uncertain = uncertain;
    this.candidates = candidates;
  }
}
export function ensure(value, code = "INVALID_INPUT") {
  if (!value) throw new ToolError(code);
}
export function localBase(
  value = process.env.STUDENT_DATA_BASE_URL || "http://127.0.0.1:3000",
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ToolError("LOCAL_ENDPOINT_REQUIRED");
  }
  ensure(
    url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    "LOCAL_ENDPOINT_REQUIRED",
  );
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}
export const messages = {
  INVALID_INPUT: "参数、字段、ID、版本或具体日期无效；请检查命令文档。",
  LOCAL_ENDPOINT_REQUIRED: "只允许无凭据、无路径的本机回环HTTP地址。",
  PREFLIGHT_FAILED:
    "数据库范围或开发操作人前置条件未通过；执行db-preflight核对，不恢复种子或猜测操作人。",
  SERVICE_UNAVAILABLE: "本机服务不可用，请核对监听地址和端口。",
  SESSION_REQUIRED:
    "未找到本机登录会话；请运行 node scripts/session.mjs login。",
  SESSION_EXPIRED:
    "本机会话已失效、退出或安全校验已更新；请运行 node scripts/session.mjs login。",
  SESSION_ENDPOINT_MISMATCH:
    "本机会话绑定的本机服务地址不同；请在目标地址重新登录。",
  SESSION_STORAGE_UNAVAILABLE:
    "本机会话安全存储不可用；请检查当前系统用户的本地应用数据目录权限。",
  RESULT_UNKNOWN: "提交结果不明；仅回读核对，禁止自动重发。",
  UNEXPECTED_RESPONSE: "服务响应不符合契约，已停止。",
  VERSION_CONFLICT:
    "版本已变化；保留指定变更，重新查询并取得新的预览确认，不自动覆盖。",
  NOT_FOUND: "指定稳定ID未在目标范围找到。",
  STUDENT_NOT_FOUND: "指定学生ID不存在，不能查询或维护其学习记录。",
  ASSIGNMENT_CONFLICT:
    "分配状态、待完成唯一约束或版本发生冲突；整批停止，请回读核对，不自动重发。",
  LOOKUP_LIMIT:
    "定位超过20页上限或分页发生变化；停止并人工核对，不把截断结果当不存在。",
  STUDENT_POSSIBLE_DUPLICATE:
    "可能重复；核对候选后须单独确认，不能自动带重复确认标记重发。",
  DEV_ACTOR_UNAVAILABLE:
    "服务端操作人未配置或无效，禁止写入；不能由脚本创建或指定。",
  STORAGE_UNAVAILABLE: "数据服务不可用；请核对前置条件。",
  VALIDATION_ERROR: "字段校验未通过，请核对字段/日期，不重试原写请求。",
  PAYLOAD_TOO_LARGE: "请求超过服务端大小限制。",
  API_NOT_FOUND: "本机服务没有该API，请核对服务版本和端口。",
  DUPLICATE_PENDING: "存在重复待完成分配；整批停止，不静默跳过。",
  TASK_DISABLED: "任务已停用，不能新分配。",
  VERIFY_FAILED: "API已应答，但回读不一致或不可达；请人工核对，不重发。",
};
export function text(value) {
  return (
    String(value)
      // eslint-disable-next-line no-control-regex -- strip terminal escape sequences from untrusted API text
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
      // eslint-disable-next-line no-control-regex -- intentionally remove non-printing control characters
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
      .replace(/\+?\d[\d ()-]{4,}\d/g, (s) =>
        (s.match(/\d/g)?.length ?? 0) >= 6 ? "[数字已脱敏]" : s,
      )
  );
}
export function safeValue(value, key = "") {
  if (key === "guardianPhone" || key === "guardianPhoneMasked")
    return value == null ? null : "[联系方式已隐藏]";
  if (Array.isArray(value)) return value.map((v) => safeValue(v, key));
  if (value && typeof value === "object") {
    if (typeof value.field === "string" && Object.hasOwn(value, "after"))
      return {
        field: text(value.field),
        before: safeValue(value.before, value.field),
        after: safeValue(value.after, value.field),
      };
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, safeValue(v, k)]),
    );
  }
  if (typeof value !== "string") return value;
  // IDs/dates are displayed exactly only in their explicitly typed fields.
  if (
    (/^(id|studentId|taskId|assignmentIds|targetIds)$/.test(key) &&
      /^[1-9]\d{0,19}$/.test(value)) ||
    (/^(occurredOn|dueDate|enrolledAt|startDate|endDate|expiryDate|lastFollowUp|completedAt|createdAt|updatedAt|assignedAt)$/.test(
      key,
    ) &&
      /^\d{4}-\d{2}-\d{2}(?:[ T][0-9:.Z+-]+)?$/.test(value))
  )
    return value;
  return text(value);
}
const fields = {
  students: [
    "id",
    "name",
    "grade",
    "school",
    "className",
    "gender",
    "status",
    "version",
    "enrolledAt",
    "guardianName",
    "guardianPhoneMasked",
    "note",
    "subjects",
    "expiryDate",
    "lastFollowUp",
  ],
  records: [
    "id",
    "studentId",
    "category",
    "content",
    "occurredOn",
    "version",
    "createdAt",
    "updatedAt",
  ],
  tasks: [
    "id",
    "title",
    "subject",
    "description",
    "status",
    "version",
    "assignmentCount",
  ],
  assignments: [
    "id",
    "studentId",
    "studentName",
    "taskId",
    "taskTitle",
    "subject",
    "description",
    "status",
    "dueDate",
    "dueState",
    "completedAt",
    "version",
  ],
  contracts: [
    "id",
    "studentId",
    "studentName",
    "subject",
    "contractType",
    "status",
    "startDate",
    "endDate",
    "attendedLessons",
    "totalLessons",
    "makeupLessons",
    "version",
  ],
  plans: ["id", "title", "summary", "content", "version", "updatedAt"],
};
export function project(domain, row) {
  ensure(row && typeof row === "object", "UNEXPECTED_RESPONSE");
  for (const key of fields[domain]) {
    if (!Object.hasOwn(row, key) || row[key] === null) continue;
    ensure(
      key === "subjects"
        ? Array.isArray(row[key]) &&
            row[key].every((v) => typeof v === "string")
        : ["string", "number", "boolean"].includes(typeof row[key]),
      "UNEXPECTED_RESPONSE",
    );
  }
  const result = Object.fromEntries(
    fields[domain]
      .filter((key) => Object.hasOwn(row, key))
      .map((key) => [key, row[key]]),
  );
  if (domain === "students" && Array.isArray(row.plans))
    result.plans = row.plans.map(({ id, title }) => {
      ensure(
        typeof id === "string" && typeof title === "string",
        "UNEXPECTED_RESPONSE",
      );
      return { id, title };
    });
  return safeValue(result);
}
export function pageResult(domain, page) {
  ensure(
    Array.isArray(page?.items) &&
      page.items.length <= 100 &&
      Number.isInteger(page.total) &&
      page.total >= 0 &&
      Number.isInteger(page.page) &&
      page.page >= 1 &&
      Number.isInteger(page.pageSize) &&
      page.pageSize >= 1 &&
      page.pageSize <= 100,
    "UNEXPECTED_RESPONSE",
  );
  return {
    items: page.items.map((item) => project(domain, item)),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}
export function apiClient(base, fetcher = fetch, options = {}) {
  const origin = localBase(base);
  const sessionProvider =
    options.sessionProvider ?? ((endpoint) => localSessionStore.load(endpoint));
  const clearSession =
    options.clearSession ?? (() => localSessionStore.clear());
  return async (path, method = "GET", body) => {
    ensure(path.startsWith("/api/") && !path.includes("\\"));
    const write = method !== "GET";
    try {
      let session;
      try {
        session = await sessionProvider(origin.origin);
      } catch (error) {
        if (error instanceof LocalSessionError) throw new ToolError(error.code);
        throw new ToolError("SESSION_STORAGE_UNAVAILABLE");
      }
      const response = await fetcher(new URL(path, origin), {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookieHeader(session),
          ...(write
            ? {
                Origin: origin.origin,
                "X-CSRF-Token": session.csrfToken,
              }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      ensure(
        response.headers.get("content-type")?.includes("application/json"),
        "UNEXPECTED_RESPONSE",
      );
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          ensure(size <= 2 * 1024 * 1024, "UNEXPECTED_RESPONSE");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!response.ok || payload?.status !== "ok") {
        const responseCode = payload?.data?.code;
        if (["UNAUTHENTICATED", "CSRF_INVALID"].includes(responseCode)) {
          try {
            await clearSession();
          } catch {
            throw new ToolError("SESSION_STORAGE_UNAVAILABLE");
          }
          throw new ToolError("SESSION_EXPIRED");
        }
        const code = Object.hasOwn(messages, responseCode ?? "")
          ? responseCode
          : "UNEXPECTED_RESPONSE";
        throw new ToolError(
          code,
          write &&
            (response.status >= 500 ||
              ![400, 404, 409, 413].includes(response.status)),
          payload?.data?.candidates,
        );
      }
      ensure(
        response.status === (method === "POST" ? 201 : 200),
        "UNEXPECTED_RESPONSE",
      );
      return payload.data;
    } catch (error) {
      if (
        error instanceof ToolError &&
        (!write || error.code !== "UNEXPECTED_RESPONSE")
      )
        throw error;
      throw new ToolError(
        write ? "RESULT_UNKNOWN" : "SERVICE_UNAVAILABLE",
        write,
      );
    }
  };
}
export function query(path, values) {
  const params = new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  return path + "?" + params;
}
export async function collect(request, path, filter) {
  const rows = [];
  let total;
  for (let page = 1; page <= 20; page++) {
    const data = await request(query(path, { ...filter, page, pageSize: 100 }));
    ensure(
      Array.isArray(data?.items) &&
        data.items.length <= 100 &&
        Number.isInteger(data.total) &&
        data.total >= 0 &&
        data.page === page &&
        data.pageSize === 100,
      "UNEXPECTED_RESPONSE",
    );
    if (total !== undefined) ensure(total === data.total, "LOOKUP_LIMIT");
    total = data.total;
    ensure(total <= 2000, "LOOKUP_LIMIT");
    rows.push(...data.items);
    if (page * 100 >= total) {
      ensure(
        rows.length === total &&
          new Set(rows.map((r) => r.id)).size === rows.length,
        "LOOKUP_LIMIT",
      );
      return rows;
    }
  }
  throw new ToolError("LOOKUP_LIMIT");
}
export async function preflight(requireActor = false) {
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL("../db-preflight.mjs", import.meta.url)),
        "--json",
        ...(requireActor ? ["--require-actor"] : []),
      ],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 8192,
      },
    );
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    ensure(
      result.databaseApproved === true &&
        (!requireActor || result.actorReady === true),
    );
    return result;
  } catch {
    throw new ToolError("PREFLIGHT_FAILED");
  }
}
