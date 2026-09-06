import { isDeepStrictEqual } from "node:util";

// Never let assertion diagnostics expand a student, body, contact or driver error.
function check(value, label = "S7 契约断言失败（已脱敏）") {
  if (!value) throw new Error(label);
}
export const safeAssert = {
  ok: check,
  equal: (actual, expected, label) => check(Object.is(actual, expected), label),
  notEqual: (actual, expected, label) =>
    check(!Object.is(actual, expected), label),
  deepEqual: (actual, expected, label) =>
    check(isDeepStrictEqual(actual, expected), label),
  rejects: async (operation) => {
    let rejected = false;
    try {
      await operation;
    } catch {
      rejected = true;
    }
    check(rejected, "预期拒绝未发生（已脱敏）");
  },
};
export function boundedDatabase(db) {
  return new Proxy(db, {
    get(target, key) {
      if (key === "query" || key === "execute")
        return (sql, args) =>
          target[key](
            { ...(typeof sql === "string" ? { sql } : sql), timeout: 15000 },
            args,
          );
      if (["beginTransaction", "commit", "rollback"].includes(key))
        return () =>
          target.query({
            sql: {
              beginTransaction: "START TRANSACTION",
              commit: "COMMIT",
              rollback: "ROLLBACK",
            }[key],
            timeout: 15000,
          });
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function profileState(row) {
  return {
    id: String(row.id),
    version: row.version,
    name: row.name,
    grade: row.grade,
    school: row.school,
    className: row.class_name,
    gender: row.gender,
    enrolledAt: row.enrolled_at,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    note: row.note,
    status: row.status,
    owner: row.owner_user_id,
    createdAt: row.created_at,
  };
}
export function profileFields(state) {
  const {
    name,
    grade,
    school,
    className,
    gender,
    enrolledAt,
    guardianName,
    guardianPhone,
    note,
  } = state;
  return {
    name,
    grade,
    school,
    className,
    gender,
    enrolledAt,
    guardianName,
    guardianPhone,
    note,
  };
}
export function createRecovery(initial, read, write) {
  const baseline = structuredClone(initial);
  const known = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  let uncertain = false;
  return {
    uncertain() {
      uncertain = true;
    },
    before(body) {
      check(!uncertain, "结果不明，停止后续写入");
      const row = known.get(body.id);
      check(
        row && row.version === body.expectedVersion,
        "固定样例版本不匹配，停止写入",
      );
    },
    acknowledge(body, result) {
      const row = known.get(body.id);
      if (
        !row ||
        body.expectedVersion !== row.version ||
        result.id !== row.id
      ) {
        uncertain = true;
        throw new Error("写入回执不匹配，停止写入并人工核对");
      }
      const noOp = "status" in body && body.status === row.status;
      if (result.version !== row.version + (noOp ? 0 : 1)) {
        uncertain = true;
        throw new Error("写入版本回执不匹配，停止写入并人工核对");
      }
      known.set(row.id, {
        ...row,
        ...("status" in body ? { status: body.status } : profileFields(body)),
        version: result.version,
      });
    },
    async restore() {
      if (uncertain)
        throw new Error("结果不明：停止恢复写入，请人工核对固定样例");
      for (const original of baseline) {
        const expected = known.get(original.id);
        const current = await read(original.id);
        check(
          isDeepStrictEqual(current, expected),
          "当前版本或业务状态变化：停止恢复，请人工核对固定样例",
        );
        // At most two optimistic API writes per known fixture; never retry.
        if (
          !isDeepStrictEqual(profileFields(current), profileFields(original))
        ) {
          await write("update", {
            ...profileFields(original),
            id: original.id,
            expectedVersion: expected.version,
          });
        }
        const latest = known.get(original.id);
        if (latest.status !== original.status) {
          check(
            isDeepStrictEqual(await read(original.id), latest),
            "恢复期间出现外部修改，停止写入",
          );
          await write("status", {
            id: original.id,
            expectedVersion: latest.version,
            status: original.status,
          });
        }
        check(
          isDeepStrictEqual(await read(original.id), known.get(original.id)),
          "恢复后核对失败，请人工核对固定样例",
        );
      }
    },
  };
}

// Preserve the primary failure object without printing its potentially sensitive message.
export async function runWithRecovery(
  work,
  restore,
  verify,
  report = console.error,
) {
  let primary, recovery, verification;
  try {
    await work();
  } catch (error) {
    primary = error;
  } finally {
    try {
      await restore();
    } catch (error) {
      recovery = error;
    }
    // Always reconcile, even after unexpected actor success or failed recovery.
    try {
      await verify();
    } catch (error) {
      verification = error;
    }
  }
  if (primary || recovery || verification) {
    report(
      `[FAIL] S7 主测试=${primary ? "失败" : "完成"}；恢复=${recovery ? "失败/停止" : "完成"}；数据核对=${verification ? "失败" : "完成"}。未输出字段或底层异常；失败/结果不明时请人工核对登记样例，禁止自动重试。`,
    );
    const failure = new Error("S7 测试或恢复未通过（已脱敏）");
    Object.defineProperties(failure, {
      primary: { value: primary },
      recovery: { value: recovery },
      verification: { value: verification },
    });
    throw failure;
  }
}
