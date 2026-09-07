import { contracts, isWrite, prepare } from "./data-operations.mjs";
import {
  apiClient,
  preflight,
  ensure,
  ToolError,
  messages,
  safeValue,
  project,
} from "./data-api.mjs";

const controls = ["apply", "confirm", "json", "inputStdin"];
const flags = new Set([...controls, "confirmPossibleDuplicate"]);
export function parseArgs(domain, argv, stdin) {
  const [command = "help", ...rest] = argv;
  if (command === "help" && !rest.length)
    return { command, input: {}, apply: false };
  const allowed = contracts[domain]?.[command];
  ensure(allowed);
  const values = Object.create(null);
  for (let index = 0; index < rest.length; index++) {
    ensure(/^--[a-z]+(?:-[a-z]+)*$/.test(rest[index]));
    const key = rest[index]
      .slice(2)
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    ensure(
      [...allowed, ...controls].includes(key) && !Object.hasOwn(values, key),
    );
    // Contact changes must not appear in shell history or process arguments.
    ensure(key !== "guardianPhone");
    if (flags.has(key)) values[key] = true;
    else {
      const value = rest[++index];
      ensure(typeof value === "string" && !value.startsWith("--"));
      values[key] = value;
    }
  }
  ensure(Boolean(values.apply) === Boolean(values.confirm));
  ensure(isWrite(command) || (!values.apply && !values.inputStdin));
  if (values.inputStdin) {
    ensure(stdin && typeof stdin === "object" && !Array.isArray(stdin));
    for (const [key, value] of Object.entries(stdin)) {
      ensure(allowed.includes(key) && !Object.hasOwn(values, key));
      values[key] = value;
    }
  } else ensure(stdin === undefined);
  return {
    command,
    input: Object.fromEntries(
      Object.entries(values).filter(([key]) => !controls.includes(key)),
    ),
    apply: values.apply === true,
  };
}
function failure(error) {
  const code = Object.hasOwn(messages, error?.code ?? "")
    ? error.code
    : "INVALID_INPUT";
  return { code, message: messages[code] };
}
export async function runOperation(domain, argv, options = {}) {
  const emit =
    options.emit ?? ((value) => console.log(JSON.stringify(safeValue(value))));
  const { command, input, apply } = parseArgs(domain, argv, options.input);
  if (command === "help") {
    emit({
      domain,
      commands: contracts[domain],
      usage:
        "写入先不带开关预览；用户确认同一目标/指定字段/版本/具体日期后才加 --apply --confirm。清空用 --clear field 或stdin显式null；联系方式仅stdin。详见scripts/README.md。",
    });
    return;
  }
  // The database preflight remains a read-only approved-boundary check.
  // S8.7 authorization comes exclusively from the local HTTP session.
  const prerequisite = await (options.preflight ?? preflight)(false);
  ensure(prerequisite.databaseApproved === true, "PREFLIGHT_FAILED");
  const request = options.request ?? apiClient();
  let plan;
  try {
    plan = await prepare(domain, command, input, request);
  } catch (error) {
    throw new ToolError(failure(error).code);
  }
  if (Object.hasOwn(plan, "read")) {
    emit({ phase: "query", result: plan.read });
    return;
  }
  emit(
    safeValue({
      phase: "preview",
      operation: `${domain}.${command}`,
      ...plan.preview,
      databaseApproved: prerequisite.databaseApproved,
      applied: false,
    }),
  );
  if (!apply) return;
  let result;
  try {
    result = await request(plan.path, plan.method, plan.body);
  } catch (error) {
    if (error?.code === "STUDENT_POSSIBLE_DUPLICATE")
      emit({
        phase: "duplicate",
        impactCount: 0,
        candidates: Array.isArray(error.candidates)
          ? error.candidates.slice(0, 5).map((row) =>
              project("students", {
                id: row.id,
                name: row.name,
                school: row.school,
                className: row.className,
                status: row.status,
              }),
            )
          : [],
      });
    if (
      error?.uncertain ||
      ["VERSION_CONFLICT", "ASSIGNMENT_CONFLICT"].includes(error?.code)
    ) {
      let snapshot;
      try {
        snapshot = await plan.reconcile();
      } catch {
        snapshot = { unavailable: true };
      }
      emit(
        safeValue({
          phase: error?.uncertain ? "result-unknown" : "conflict",
          impactCount: error?.uncertain ? null : 0,
          verified: false,
          retry: false,
          snapshot,
        }),
      );
    }
    throw new ToolError(failure(error).code, error?.uncertain);
  }
  try {
    const verified = await plan.verify(result);
    emit(
      safeValue({
        phase: "saved",
        verified: true,
        impactCount: plan.preview.impactCount,
        result: verified,
      }),
    );
  } catch {
    emit({
      phase: "saved-unverified",
      apiAcknowledged: true,
      verified: false,
      impactCount: null,
      retry: false,
    });
    throw new ToolError("VERIFY_FAILED");
  }
}
async function stdinJson() {
  const chunks = [];
  let size = 0;
  const timer = setTimeout(
    () => process.stdin.destroy(new Error("input timeout")),
    10000,
  );
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      ensure(size <= 128 * 1024);
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    clearTimeout(timer);
  }
}
export async function cli(domain) {
  try {
    const argv = process.argv.slice(2);
    const input = argv.includes("--input-stdin")
      ? await stdinJson()
      : undefined;
    await runOperation(domain, argv, { input });
  } catch (error) {
    console.error(
      JSON.stringify({ phase: "stopped", ...failure(error), retry: false }),
    );
    process.exitCode = 1;
  }
}
