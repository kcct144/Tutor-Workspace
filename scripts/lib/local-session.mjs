import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const stateFilename = "data-operation-session.json";
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export class LocalSessionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function localSessionDirectory() {
  const base =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA
      : process.env.XDG_STATE_HOME ||
        path.join(os.homedir(), ".local", "state");
  if (typeof base !== "string" || !path.isAbsolute(base))
    throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
  return path.join(base, "Tutor-Workspace");
}

function canonicalBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new LocalSessionError("LOCAL_ENDPOINT_REQUIRED");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new LocalSessionError("LOCAL_ENDPOINT_REQUIRED");
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

function validState(value) {
  return (
    value &&
    typeof value === "object" &&
    value.schemaVersion === 1 &&
    typeof value.baseUrl === "string" &&
    tokenPattern.test(value.sessionToken) &&
    tokenPattern.test(value.csrfToken)
  );
}

function secureWindowsPath(target, directory, run) {
  const username = process.env.USERNAME;
  if (!username) throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
  const permission = directory ? `${username}:(OI)(CI)F` : `${username}:F`;
  try {
    run("icacls", [
      target,
      "/inheritance:r",
      "/grant:r",
      permission,
      "/grant:r",
      directory ? "SYSTEM:(OI)(CI)F" : "SYSTEM:F",
    ]);
  } catch {
    throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
  }
}

/**
 * Keeps browser-equivalent credentials outside the workspace. The injectable
 * dependencies make permission and API-boundary tests isolated from a real user profile.
 */
export function createLocalSessionStore(options = {}) {
  const rootDirectory = options.rootDirectory ?? localSessionDirectory();
  const platform = options.platform ?? process.platform;
  const run =
    options.run ??
    ((command, args) =>
      execFileSync(command, args, { stdio: "ignore", windowsHide: true }));
  const file = path.join(rootDirectory, stateFilename);

  async function secureDirectory() {
    try {
      await fs.mkdir(rootDirectory, { recursive: true, mode: 0o700 });
      if (platform === "win32") secureWindowsPath(rootDirectory, true, run);
      else await fs.chmod(rootDirectory, 0o700);
    } catch (error) {
      if (error instanceof LocalSessionError) throw error;
      throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
    }
  }

  async function secureFile(target) {
    try {
      if (platform === "win32") secureWindowsPath(target, false, run);
      else await fs.chmod(target, 0o600);
    } catch (error) {
      if (error instanceof LocalSessionError) throw error;
      throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
    }
  }

  return {
    file,
    async load(baseUrl) {
      let decoded;
      try {
        decoded = JSON.parse(await fs.readFile(file, "utf8"));
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT")
          throw new LocalSessionError("SESSION_REQUIRED");
        throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
      }
      if (!validState(decoded))
        throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
      const storedBase = canonicalBaseUrl(decoded.baseUrl);
      if (baseUrl && storedBase !== canonicalBaseUrl(baseUrl))
        throw new LocalSessionError("SESSION_ENDPOINT_MISMATCH");
      return {
        baseUrl: storedBase,
        sessionToken: decoded.sessionToken,
        csrfToken: decoded.csrfToken,
      };
    },
    async save(state) {
      if (!validState({ ...state, schemaVersion: 1 }))
        throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
      const safeState = {
        schemaVersion: 1,
        baseUrl: canonicalBaseUrl(state.baseUrl),
        sessionToken: state.sessionToken,
        csrfToken: state.csrfToken,
      };
      await secureDirectory();
      const temporary = path.join(rootDirectory, `.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify(safeState), {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await secureFile(temporary);
        await fs.rename(temporary, file);
        await secureFile(file);
      } catch (error) {
        await fs.unlink(temporary).catch(() => {});
        if (error instanceof LocalSessionError) throw error;
        throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
      }
    },
    async clear() {
      try {
        await fs.unlink(file);
        return true;
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT")
          return false;
        throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
      }
    },
  };
}

export const localSessionStore = createLocalSessionStore();

export function sessionCookieHeader(state) {
  if (!validState({ ...state, schemaVersion: 1 }))
    throw new LocalSessionError("SESSION_STORAGE_UNAVAILABLE");
  return `tws_session=${state.sessionToken}; tws_csrf=${state.csrfToken}`;
}

export function localSessionBaseUrl(value) {
  return canonicalBaseUrl(value);
}
