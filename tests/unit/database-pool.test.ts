import { beforeEach, describe, expect, it, vi } from "vitest";
import { withDatabase, closeMysqlPool } from "../../server/db/pool";

const mock = vi.hoisted(() => {
  const connection = { query: vi.fn(), release: vi.fn() };
  return {
    connection,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection),
      end: vi.fn(),
    },
  };
});
vi.mock("mysql2/promise", () => ({ createPool: () => mock.pool }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.connection.query.mockResolvedValue([
    [{ current_database: "tutor_workspace" }],
  ]);
});
describe("pool cleanup", () => {
  // Pool creation is mocked: no host, user or password is supplied or contacted.
  const settings = {
    host: "",
    user: "",
    password: "",
    database: "tutor_workspace",
    port: 3306,
  };
  it("releases connections after success and failure", async () => {
    // Initialize using the mocked factory without invoking configuration validation.
    const { getMysqlPool } = await import("../../server/db/pool");
    vi.spyOn(
      await import("../../server/db/config"),
      "mysqlOptions",
    ).mockReturnValue({});
    getMysqlPool(settings);
    await expect(withDatabase(settings, async () => "ok")).resolves.toBe("ok");
    await expect(
      withDatabase(settings, async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow();
    expect(mock.connection.release).toHaveBeenCalledTimes(2);
    await closeMysqlPool();
    expect(mock.pool.end).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
  it("never calls business queries when the current database differs", async () => {
    vi.spyOn(
      await import("../../server/db/config"),
      "mysqlOptions",
    ).mockReturnValue({});
    mock.connection.query.mockResolvedValue([[{ current_database: null }]]);
    const work = vi.fn();
    await expect(withDatabase(settings, work)).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
    expect(mock.connection.release).toHaveBeenCalledOnce();
    await closeMysqlPool();
    vi.restoreAllMocks();
  });
});
