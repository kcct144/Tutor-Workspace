import type { H3Event } from "h3";

const sessionMaxAge = 7 * 24 * 60 * 60;

export function secureCookieForProtocol(protocol: string): boolean {
  return protocol === "https";
}

export function originsMatch(
  requestOrigin: string,
  origin: string | undefined,
): boolean {
  return origin !== undefined && origin === requestOrigin;
}

export function browserCookieOptions(event: H3Event) {
  return {
    path: "/",
    sameSite: "strict" as const,
    secure: secureCookieForProtocol(getRequestProtocol(event)),
  };
}

export function browserCookieNames(event: H3Event) {
  const prefix = browserCookieOptions(event).secure ? "__Host-" : "";
  return {
    session: `${prefix}tws_session`,
    csrf: `${prefix}tws_csrf`,
  };
}

export function setBrowserSessionCookies(
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
): void {
  const options = browserCookieOptions(event);
  const names = browserCookieNames(event);
  setCookie(event, names.session, sessionToken, {
    ...options,
    httpOnly: true,
    maxAge: sessionMaxAge,
  });
  setCookie(event, names.csrf, csrfToken, {
    ...options,
    httpOnly: false,
    maxAge: sessionMaxAge,
  });
}

export function clearBrowserSessionCookies(event: H3Event): void {
  const options = browserCookieOptions(event);
  const names = browserCookieNames(event);
  deleteCookie(event, names.session, options);
  deleteCookie(event, names.csrf, options);
}

export function sameOrigin(event: H3Event): boolean {
  return originsMatch(
    getRequestURL(event).origin,
    getRequestHeader(event, "origin"),
  );
}
