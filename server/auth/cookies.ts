import type { H3Event } from "h3";

export const sessionCookieName = "tws_session";
export const csrfCookieName = "tws_csrf";
const sessionMaxAge = 7 * 24 * 60 * 60;

function localHost(event: H3Event): boolean {
  const host = getRequestURL(event).hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function assertLoopbackRequest(event: H3Event): void {
  if (!localHost(event)) throw new Error("本机访问边界校验失败。");
}

export function setBrowserSessionCookies(
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
): void {
  assertLoopbackRequest(event);
  const options = { path: "/", sameSite: "strict" as const, secure: false };
  setCookie(event, sessionCookieName, sessionToken, {
    ...options,
    httpOnly: true,
    maxAge: sessionMaxAge,
  });
  setCookie(event, csrfCookieName, csrfToken, {
    ...options,
    httpOnly: false,
    maxAge: sessionMaxAge,
  });
}

export function clearBrowserSessionCookies(event: H3Event): void {
  const options = { path: "/", sameSite: "strict" as const, secure: false };
  deleteCookie(event, sessionCookieName, options);
  deleteCookie(event, csrfCookieName, options);
}

export function sameOrigin(event: H3Event): boolean {
  const origin = getRequestHeader(event, "origin");
  if (!origin) return false;
  return origin === getRequestURL(event).origin && localHost(event);
}
