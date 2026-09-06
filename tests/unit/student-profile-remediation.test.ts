import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import type { PoolConnection } from "mysql2/promise";
import { validateProfile } from "../../app/utils/student-profile-validation";
import { parseStudentCreate } from "../../server/db/student-profile-rules";
import { createStudent } from "../../server/db/student-profile";
import { inTransaction } from "../../server/db/pool";
import { useStudentStatus } from "../../app/composables/useStudentStatus";
import type { StudentDetail } from "../../types/api/students";
import {
  createRecovery,
  runWithRecovery,
  safeAssert,
} from "../integration/student-profile-recovery.mjs";
vi.mock("../../server/db/students.ts", () => ({
  findStudent: vi.fn(async () => ({ id: "20" })),
}));
const api = vi.hoisted(() => ({
  getStudent: vi.fn(),
  updateStudentStatus: vi.fn(),
}));
vi.mock("~/services/students", () => api);
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  notifyStudentChange: vi.fn(),
}));
const base = parseStudentCreate({ name: "合成", grade: "初一" });
describe("S7 remediation", () => {
  it.each([false, true])(
    "bounded duplicate SELECT inside transaction before insertion, confirmed=%s",
    async (confirmed) => {
      for (const found of [false, true]) {
        const order: string[] = [];
        const db = {
          execute: async (sql: string) => {
            order.push(sql.startsWith("SELECT") ? "select" : "insert");
            if (sql.startsWith("SELECT")) {
              expect(sql).toContain("LIMIT 5");
              expect(sql).not.toContain("guardian");
              return [
                found
                  ? [
                      {
                        id: "1",
                        name: "合成",
                        school: "校",
                        class_name: "班",
                        status: "待分配",
                      },
                    ]
                  : [],
              ];
            }
            return [{ insertId: "20" }];
          },
          query: async () => [[{ current_database: "tutor_workspace" }]],
          beginTransaction: async () => {
            order.push("begin");
          },
          commit: async () => {
            order.push("commit");
          },
          rollback: async () => {
            order.push("rollback");
          },
        } as unknown as PoolConnection;
        const result = inTransaction(db, () =>
          createStudent(db, {
            ...base,
            school: "校",
            className: "班",
            confirmPossibleDuplicate: confirmed,
          }),
        );
        if (found && !confirmed) {
          await expect(result).rejects.toMatchObject({
            code: "STUDENT_POSSIBLE_DUPLICATE",
          });
          expect(order).toEqual(["begin", "select", "rollback"]);
        } else {
          await result;
          expect(order).toEqual(["begin", "select", "insert", "commit"]);
        }
      }
    },
  );
  it("client Unicode and optional field validation agrees with server", () => {
    for (const [field, max] of [
      ["name", 64],
      ["school", 128],
      ["className", 32],
      ["guardianName", 64],
      ["note", 500],
    ] as const) {
      for (const count of [max, max + 1]) {
        const draft = { ...base, [field]: "😀".repeat(count) };
        expect(Boolean(validateProfile(draft, "2026-09-06")[field])).toBe(
          count > max,
        );
        if (count === max)
          expect(() => parseStudentCreate(draft)).not.toThrow();
        else expect(() => parseStudentCreate(draft)).toThrow();
      }
    }
    for (const extra of [
      { name: " " },
      { grade: undefined },
      { guardianPhone: "00000" },
      { guardianPhone: "000****0000" },
      { guardianPhone: "0".repeat(33) },
      { enrolledAt: "1899-12-31" },
      { enrolledAt: "2026-02-30" },
      { enrolledAt: "2026-09-07" },
    ])
      expect(
        Object.keys(validateProfile({ ...base, ...extra }, "2026-09-06"))
          .length,
      ).toBeGreaterThan(0);
    for (const date of [null, "1900-01-01", "2026-09-06"])
      expect(
        validateProfile(
          { ...base, enrolledAt: date, guardianPhone: "+00 (000) 000-000" },
          "2026-09-06",
        ),
      ).toEqual({});
  });
  it("status reload shows information, keeps target and save emits success", async () => {
    const scope = effectScope();
    const state = scope.run(useStudentStatus)!;
    state.begin({ id: "13", version: 1, status: "待分配" } as StudentDetail);
    state.target.value = "在读";
    api.updateStudentStatus.mockRejectedValueOnce(new Error("failed"));
    await state.save();
    expect(state.blocked.value).toBe(true);
    expect(state.source.value?.version).toBe(1);
    api.getStudent.mockResolvedValue({
      id: "13",
      version: 2,
      status: "待分配",
    });
    await state.reload();
    expect(state.target.value).toBe("在读");
    expect(state.info.value).toContain("已读取最新状态");
    expect(state.error.value).toBe("");
    api.updateStudentStatus.mockResolvedValue({});
    await state.save();
    expect(state.notice.value).toContain("已保存");
    scope.stop();
  });
});
describe("S7 isolated recovery safety (no database)", () => {
  const original = {
    ...base,
    id: "13",
    version: 1,
    status: "待分配",
    owner: null,
    createdAt: "fixed",
  };
  it("finally restores acknowledged own writes and retains the original failure", async () => {
    let current = { ...original };
    const write = vi.fn(async (_action, body) => {
      recovery.before(body);
      current = {
        ...current,
        status: body.status,
        version: current.version + 1,
      };
      recovery.acknowledge(body, current);
    });
    const recovery = createRecovery([original], async () => current, write);
    const failure = new Error("private-original-failure"),
      verify = vi.fn();
    await expect(
      runWithRecovery(
        async () => {
          await write("status", {
            id: "13",
            status: "在读",
            expectedVersion: 1,
          });
          throw failure;
        },
        () => recovery.restore(),
        verify,
        vi.fn(),
      ),
    ).rejects.toHaveProperty("primary", failure);
    expect(current.status).toBe("待分配");
    expect(current.version).toBe(3);
    expect(verify).toHaveBeenCalledOnce();
  });
  it.each(["version", "business", "offline", "unknown"])(
    "stops writes on %s; still verifies and fails",
    async (kind) => {
      const write = vi.fn();
      const recovery = createRecovery(
        [original],
        async () => {
          if (kind === "offline") throw new Error("private-driver-error");
          return {
            ...original,
            ...(kind === "version"
              ? { version: 2 }
              : kind === "business"
                ? { name: "external" }
                : {}),
          };
        },
        write,
      );
      if (kind === "unknown") recovery.uncertain();
      const verify = vi.fn(),
        log = vi.fn();
      await expect(
        runWithRecovery(
          async () => {},
          () => recovery.restore(),
          verify,
          log,
        ),
      ).rejects.toThrow("未通过");
      expect(write).not.toHaveBeenCalled();
      expect(verify).toHaveBeenCalledOnce();
      expect(log.mock.calls.flat().join()).not.toContain(
        "private-driver-error",
      );
    },
  );
  it("recovery failure cannot mask original; unexpected actor success still reconciles", async () => {
    const primary = new Error("private-body"),
      recovery = new Error("private-connection");
    const verify = vi.fn(),
      log = vi.fn();
    await expect(
      runWithRecovery(
        async () => {
          throw primary;
        },
        async () => {
          throw recovery;
        },
        verify,
        log,
      ),
    ).rejects.toMatchObject({ primary, recovery });
    expect(verify).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join()).not.toMatch(/private|PASS/);
    expect(() =>
      safeAssert.deepEqual({ guardianPhone: "private-contact" }, {}),
    ).toThrow("已脱敏");
  });
});
