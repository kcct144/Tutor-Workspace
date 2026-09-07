import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalSessionStore,
  LocalSessionError,
} from "../../scripts/lib/local-session.mjs";
import {
  authenticatedRequest,
  command,
  loginLocalSession,
} from "../../scripts/session.mjs";
import { apiClient } from "../../scripts/lib/data-api.mjs";

const baseUrl = "http://127.0.0.1:3017";
const token = (letter: string) => letter.repeat(43);
const session = token("a");
const csrf = token("b");
const directories: string[] = [];

async function store() {
  const directory = await mkdtemp(path.join(tmpdir(), "tws-s8-7-"));
  directories.push(directory);
  return createLocalSessionStore({
    rootDirectory: directory,
    platform: "linux",
  });
}

function response(
  status: number,
  payload: unknown,
  cookies: string[] = [],
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(JSON.stringify(payload), { status, headers });
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("S8.7 local data-operation session", () => {
  it("logs in through the local API and stores only opaque session material outside the workspace", async () => {
    const local = await store();
    const password = "x".repeat(16);
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.toString()).toBe(`${baseUrl}/api/auth/login`);
      expect(init.headers).toMatchObject({ Origin: baseUrl });
      return response(
        200,
        {
          status: "ok",
          msg: "",
          data: { username: "fixture-user", name: "夹具用户", role: "advisor" },
        },
        [
          `tws_session=${session}; Path=/; HttpOnly`,
          `tws_csrf=${csrf}; Path=/`,
        ],
      );
    });
    await expect(
      loginLocalSession({
        baseUrl,
        username: "fixture-user",
        password,
        store: local,
        fetcher,
      }),
    ).resolves.toEqual({
      username: "fixture-user",
      name: "夹具用户",
      role: "advisor",
    });
    const persisted = await readFile(local.file, "utf8");
    expect(persisted).toContain(session);
    expect(persisted).toContain(csrf);
    expect(persisted).not.toContain(password);
    expect(persisted).not.toContain("fixture-user");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sets current-user-only Windows ACL commands for the external state directory and file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "tws-s8-7-windows-"));
    directories.push(directory);
    const run = vi.fn();
    const local = createLocalSessionStore({
      rootDirectory: directory,
      platform: "win32",
      run,
    });
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    expect(run).toHaveBeenCalledTimes(3);
    for (const [command, args] of run.mock.calls) {
      expect(command).toBe("icacls");
      expect(args).toContain("/inheritance:r");
      expect(args).toContain("/grant:r");
      expect(args.some((value: string) => /(?:\)|:)F$/u.test(value))).toBe(
        true,
      );
    }
  });

  it("does not create state after an unsuccessful login", async () => {
    const local = await store();
    await expect(
      loginLocalSession({
        baseUrl,
        username: "fixture-user",
        password: "x".repeat(16),
        store: local,
        fetcher: async () =>
          response(401, {
            status: "error",
            msg: "",
            data: { code: "INVALID_CREDENTIALS" },
          }),
      }),
    ).rejects.toMatchObject({ code: "LOGIN_FAILED" });
    await expect(local.load(baseUrl)).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
    });
  });

  it("requires a saved session before sending an API request", async () => {
    const local = await store();
    const fetcher = vi.fn();
    await expect(
      authenticatedRequest({
        baseUrl,
        path: "/api/auth/me",
        method: "GET",
        store: local,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("carries Cookie, Origin and CSRF for writes, without a DEV_ACTOR bypass", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("origin")).toBe(baseUrl);
      expect(headers.get("x-csrf-token")).toBe(csrf);
      expect(headers.get("cookie")).toContain("tws_session=");
      expect(headers.get("cookie")).toContain("tws_csrf=");
      expect(headers.get("x-dev-actor-id")).toBeNull();
      return response(200, { status: "ok", msg: "", data: { accepted: true } });
    });
    await expect(
      authenticatedRequest({
        baseUrl,
        path: "/api/task-assignments/completion",
        method: "PATCH",
        store: local,
        fetcher,
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it("clears expired or CSRF-invalid state and never retries the request", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    const fetcher = vi.fn(async () =>
      response(403, {
        status: "error",
        msg: "",
        data: { code: "CSRF_INVALID" },
      }),
    );
    await expect(
      authenticatedRequest({
        baseUrl,
        path: "/api/students/update",
        method: "PATCH",
        store: local,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(local.load(baseUrl)).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
    });
  });

  it("logout revokes through the API then clears local state; clear is explicit local-only cleanup", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    await expect(
      command(["logout"], {
        baseUrl,
        store: local,
        fetcher: async () =>
          response(200, { status: "ok", msg: "", data: { loggedOut: true } }),
      }),
    ).resolves.toEqual({ action: "logout", cleared: true });
    await expect(local.load(baseUrl)).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
    });
    await expect(
      command(["clear"], { baseUrl, store: local }),
    ).resolves.toEqual({
      action: "clear",
      cleared: false,
    });
  });

  it("keeps local state when logout cannot be confirmed, without an automatic retry", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    const fetcher = vi.fn(async () =>
      response(503, {
        status: "error",
        msg: "",
        data: { code: "STORAGE_UNAVAILABLE" },
      }),
    );
    await expect(
      command(["logout"], { baseUrl, store: local, fetcher }),
    ).rejects.toMatchObject({
      code: "LOGOUT_UNCONFIRMED",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(local.load(baseUrl)).resolves.toMatchObject({
      sessionToken: session,
    });
  });

  it("propagates expired API credentials to ordinary data commands and clears the session", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    const request = apiClient(
      baseUrl,
      async () =>
        response(401, {
          status: "error",
          msg: "",
          data: { code: "UNAUTHENTICATED" },
        }),
      {
        sessionProvider: (endpoint) => local.load(endpoint),
        clearSession: () => local.clear(),
      },
    );
    await expect(request("/api/students/list")).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await expect(local.load(baseUrl)).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
    });
  });

  it("fails closed when a local session is bound to another loopback endpoint", async () => {
    const local = await store();
    await local.save({ baseUrl, sessionToken: session, csrfToken: csrf });
    await expect(local.load("http://127.0.0.1:3018")).rejects.toMatchObject({
      code: "SESSION_ENDPOINT_MISMATCH",
    });
  });

  it("never exposes storage errors as implementation details", async () => {
    const error = new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
    expect(error.message).toBe("SESSION_STORAGE_UNAVAILABLE");
    expect(error.message).not.toContain(session);
  });
});
