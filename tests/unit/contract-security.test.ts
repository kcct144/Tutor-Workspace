import { describe, expect, it, vi } from "vitest";
import type { Connection } from "mysql2/promise";
import { executeWrite } from "../../server/db/write";

describe("S2 writes", () => {
  it("checks current database immediately before every write and prevents wrong-target DML", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue([[{ current_database: "tutor_workspace" }]]),
      execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    await executeWrite(
      db as unknown as Connection,
      "UPDATE contracts SET makeup_lessons = ? WHERE id = ?",
      [1, "1"],
    );
    expect(db.query.mock.invocationCallOrder[0]).toBeLessThan(
      db.execute.mock.invocationCallOrder[0]!,
    );
    db.query.mockResolvedValue([[{ current_database: null }]]);
    await expect(
      executeWrite(
        db as unknown as Connection,
        "INSERT INTO contracts (id) VALUES (?)",
        [1],
      ),
    ).rejects.toThrow();
    expect(db.execute).toHaveBeenCalledOnce();
  });
});
