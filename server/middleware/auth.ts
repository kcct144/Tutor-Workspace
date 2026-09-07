import { currentAuth, type AuthContext } from "../auth/context.ts";
import {
  assertLoopbackRequest,
  clearBrowserSessionCookies,
  csrfCookieName,
  sameOrigin,
  sessionCookieName,
} from "../auth/cookies.ts";
import {
  findActiveBrowserSession,
  sessionCsrfMatches,
} from "../db/auth-sessions.ts";
import { withDatabase } from "../db/pool.ts";
import { apiErrorResponse } from "../utils/api.ts";

function publicApi(path: string, method: string): boolean {
  return (
    (path === "/api/auth/login" && method === "POST") ||
    (path === "/api/health" && method === "GET")
  );
}

function writeMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith("/api/")) return;
  try {
    assertLoopbackRequest(event);
  } catch {
    return apiErrorResponse(event, 403, "ORIGIN_INVALID", "仅允许本机访问。");
  }
  if (publicApi(event.path, event.method)) return;

  const token = getCookie(event, sessionCookieName);
  let session;
  try {
    session = await withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      findActiveBrowserSession(connection, token),
    );
  } catch {
    return apiErrorResponse(
      event,
      503,
      "STORAGE_UNAVAILABLE",
      "数据服务暂不可用，请稍后重试。",
    );
  }
  if (!session) {
    clearBrowserSessionCookies(event);
    return apiErrorResponse(
      event,
      401,
      "UNAUTHENTICATED",
      "请先登录后再继续操作。",
    );
  }
  const auth: AuthContext = {
    sessionId: session.sessionId,
    userId: session.userId,
    name: session.name,
    username: session.username,
    role: session.role,
    mustChangePassword: session.mustChangePassword,
  };
  (event.context as { auth?: AuthContext }).auth = auth;
  if (!writeMethod(event.method)) return;
  if (
    !sameOrigin(event) ||
    !sessionCsrfMatches(session, getCookie(event, csrfCookieName))
  )
    return apiErrorResponse(
      event,
      403,
      "CSRF_INVALID",
      "请求来源或安全校验无效，请刷新页面后重试。",
    );
  // Makes accidental removal of context assignment apparent in future handlers.
  currentAuth(event);
});
