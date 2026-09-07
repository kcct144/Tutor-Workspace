import { isDeepStrictEqual } from "node:util";
import {
  parseStudentCreate,
  parseStudentUpdate,
  parseStudentStatus,
} from "../../server/db/student-profile-rules.ts";
import { parseStudentQuery } from "../../server/db/student-query.ts";
import {
  parseRecordQuery,
  parseRecordWrite,
} from "../../server/db/learning-record-rules.ts";
import {
  parseAssignmentQuery,
  parseAssignmentBatch,
  parseAssignmentCompletion,
} from "../../server/db/assignment-rules.ts";
import {
  parseContractQuery,
  positiveId,
  uint,
} from "../../server/db/contracts-rules.ts";
import { parseTaskQuery } from "../../server/db/task-rules.ts";
import { parsePlanQuery } from "../../server/db/study-plan-rules.ts";
import {
  ToolError,
  ensure,
  project,
  pageResult,
  query,
  collect,
} from "./data-api.mjs";

const profileFields = [
  "name",
  "grade",
  "school",
  "className",
  "gender",
  "enrolledAt",
  "guardianName",
  "guardianPhone",
  "note",
];
const nullable = profileFields.filter((k) => !["name", "grade"].includes(k));
const pagination = ["page", "pageSize", "keyword"];
export const contracts = {
  students: {
    list: [...pagination, "grade", "status"],
    get: ["id"],
    create: [...profileFields, "confirmPossibleDuplicate"],
    update: ["id", "expectedVersion", ...profileFields, "clear"],
    status: ["id", "expectedVersion", "status"],
  },
  records: {
    list: [...pagination, "studentId", "category", "dateFrom", "dateTo"],
    get: ["studentId", "id"],
    create: ["studentId", "category", "content", "occurredOn"],
    update: [
      "studentId",
      "id",
      "expectedVersion",
      "category",
      "content",
      "occurredOn",
    ],
  },
  tasks: {
    list: [...pagination, "subject", "status"],
    get: ["id"],
    assignments: [
      ...pagination,
      "studentId",
      "taskId",
      "subject",
      "status",
      "dueState",
    ],
    assignment: ["studentId", "taskId", "id"],
    assign: ["taskId", "studentIds", "dueDate"],
    completion: ["studentId", "taskId", "id", "expectedVersion", "completed"],
  },
  contracts: {
    list: [...pagination, "studentId", "subject", "contractType", "status"],
    get: ["id"],
  },
  plans: { list: pagination, get: ["id"] },
};
export const isWrite = (command) =>
  ["create", "update", "status", "assign", "completion"].includes(command);
const pick = (object, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(object, key))
      .map((key) => [key, object[key]]),
  );
const version = (v) => {
  ensure(
    (typeof v === "string" && /^[1-9]\d*$/.test(v)) || typeof v === "number",
  );
  return uint(Number(v), "版本", true);
};
function checkVersion(current, input) {
  ensure(
    current.version === version(input.expectedVersion),
    "VERSION_CONFLICT",
  );
}
function changes(before, after, keys) {
  return keys.map((field) => ({
    field,
    before:
      field === "guardianPhone" && before?.[field] != null
        ? "[保留原联系方式，隐藏]"
        : (before?.[field] ?? null),
    after:
      field === "guardianPhone" && after[field] != null
        ? "[提供新联系方式，隐藏]"
        : after[field],
  }));
}
async function student(request, id, edit = false) {
  const row = await request(
    query(`/api/students/${edit ? "edit" : "detail"}`, { id: positiveId(id) }),
  );
  ensure(row?.id === id, "UNEXPECTED_RESPONSE");
  return row;
}
async function find(request, domain, input) {
  const filter = { studentId: positiveId(input.studentId) };
  if (domain === "assignments") filter.taskId = positiveId(input.taskId);
  const rows = await collect(
    request,
    `/api/${domain === "records" ? "learning-records" : "task-assignments"}/list`,
    filter,
  );
  const id = positiveId(input.id);
  const row = rows.find((item) => item.id === id);
  ensure(
    row &&
      row.studentId === filter.studentId &&
      (domain !== "assignments" || row.taskId === filter.taskId),
    "NOT_FOUND",
  );
  return row;
}
function matches(row, wanted) {
  return Object.entries(wanted).every(([key, value]) =>
    isDeepStrictEqual(row[key], value),
  );
}
async function associations(request, id) {
  const detail = await student(request, id);
  const rows = await Promise.all([
    collect(request, "/api/contracts/list", { studentId: id }),
    collect(request, "/api/learning-records/list", { studentId: id }),
    collect(request, "/api/task-assignments/list", { studentId: id }),
  ]);
  return {
    plans: detail.plans,
    rows: rows.map((items) => items.sort((a, b) => a.id.localeCompare(b.id))),
  };
}
export async function prepare(domain, command, input, request) {
  const allowed = contracts[domain]?.[command];
  ensure(allowed && Object.keys(input).every((key) => allowed.includes(key)));
  if (!isWrite(command)) {
    if (command === "get") {
      if (domain === "records")
        return {
          read: project("records", await find(request, "records", input)),
        };
      const route = {
        students: "students",
        tasks: "tasks",
        contracts: "contracts",
        plans: "study-plans",
      }[domain];
      const row = await request(
        query(`/api/${route}/detail`, { id: positiveId(input.id) }),
      );
      ensure(row?.id === input.id, "UNEXPECTED_RESPONSE");
      return { read: project(domain, row) };
    }
    if (command === "assignment")
      return {
        read: project("assignments", await find(request, "assignments", input)),
      };
    const parser =
      command === "assignments"
        ? parseAssignmentQuery
        : {
            students: parseStudentQuery,
            records: parseRecordQuery,
            tasks: parseTaskQuery,
            contracts: parseContractQuery,
            plans: parsePlanQuery,
          }[domain];
    const parsed = parser(input);
    const route =
      command === "assignments"
        ? "task-assignments"
        : {
            students: "students",
            records: "learning-records",
            tasks: "tasks",
            contracts: "contracts",
            plans: "study-plans",
          }[domain];
    return {
      read: pageResult(
        command === "assignments" ? "assignments" : domain,
        await request(query(`/api/${route}/list`, parsed)),
      ),
    };
  }
  if (domain === "students") return prepareStudent(command, input, request);
  if (domain === "records") return prepareRecord(command, input, request);
  if (domain === "tasks") return prepareAssignment(command, input, request);
  throw new ToolError("INVALID_INPUT");
}
async function prepareStudent(command, input, request) {
  const id = command === "create" ? undefined : positiveId(input.id);
  const before = id
    ? await student(request, id, command === "update")
    : undefined;
  if (before) checkVersion(before, input);
  const provided = pick(input, profileFields);
  if (input.clear !== undefined) {
    ensure(typeof input.clear === "string");
    const clear = input.clear
      .split(",")
      .map((s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
    ensure(
      clear.length > 0 &&
        new Set(clear).size === clear.length &&
        clear.every((f) => nullable.includes(f) && !Object.hasOwn(provided, f)),
    );
    for (const f of clear) provided[f] = null;
  }
  for (const [key, value] of Object.entries(provided))
    ensure(value !== null || nullable.includes(key));
  // Empty text is not an accidental clear. Only explicit null/--clear can clear.
  ensure(
    Object.values(provided).every(
      (v) => v === null || (typeof v === "string" && v.trim() !== ""),
    ),
  );
  let body, related;
  if (command === "status") {
    body = parseStudentStatus({
      id,
      status: input.status,
      expectedVersion: version(input.expectedVersion),
    });
    related = await associations(request, id);
  } else if (command === "update") {
    ensure(Object.keys(provided).length > 0);
    ensure(
      profileFields.every((key) => Object.hasOwn(before, key)),
      "UNEXPECTED_RESPONSE",
    );
    body = parseStudentUpdate({
      ...pick(before, profileFields),
      ...provided,
      id,
      expectedVersion: version(input.expectedVersion),
    });
    ensure(
      profileFields.every(
        (key) =>
          Object.hasOwn(provided, key) ||
          isDeepStrictEqual(body[key], before[key]),
      ),
      "INVALID_INPUT",
    );
  } else
    body = parseStudentCreate({
      ...provided,
      ...(input.confirmPossibleDuplicate !== undefined
        ? { confirmPossibleDuplicate: input.confirmPossibleDuplicate }
        : {}),
    });
  const target = before
    ? project("students", before)
    : { status: "待分配", owner: null };
  return {
    path: `/api/students/${command}`,
    method: command === "create" ? "POST" : "PATCH",
    body,
    preview: {
      targets: [target],
      impactCount: 1,
      expectedVersion: before?.version,
      changes: changes(
        before,
        body,
        command === "status" ? ["status"] : Object.keys(provided),
      ),
      ...(command === "status"
        ? { associationPolicy: "结课/恢复不删除、不解绑任何关联数据" }
        : {}),
      ...(body.confirmPossibleDuplicate ? { duplicateConfirmed: true } : {}),
    },
    reconcile: async () =>
      id
        ? project("students", await student(request, id))
        : pageResult(
            "students",
            await request(
              query("/api/students/list", {
                keyword: body.name,
                page: 1,
                pageSize: 100,
              }),
            ),
          ),
    verify: async (result) => {
      const targetId = id ?? positiveId(result.id);
      ensure(result.id === targetId, "VERIFY_FAILED");
      const current = await student(request, targetId);
      const wantedVersion = before
        ? before.version +
          (command === "status" && before.status === body.status ? 0 : 1)
        : 1;
      ensure(
        result.version === wantedVersion && current.version === wantedVersion,
        "VERIFY_FAILED",
      );
      if (command === "status") {
        ensure(
          current.status === body.status &&
            isDeepStrictEqual(await associations(request, targetId), related),
          "VERIFY_FAILED",
        );
      } else {
        const edit = await student(request, targetId, true);
        ensure(
          edit.version === wantedVersion &&
            matches(edit, pick(body, profileFields)),
          "VERIFY_FAILED",
        );
        if (command === "create")
          ensure(
            current.status === "待分配" && current.owner === null,
            "VERIFY_FAILED",
          );
      }
      return project("students", current);
    },
  };
}
async function prepareRecord(command, input, request) {
  const studentId = positiveId(input.studentId);
  const target = await student(request, studentId);
  const fields = ["category", "content", "occurredOn"];
  const before =
    command === "update" ? await find(request, "records", input) : undefined;
  if (before) checkVersion(before, input);
  const provided = pick(input, fields);
  ensure(Object.keys(provided).length > 0);
  const body = before
    ? parseRecordWrite(
        {
          ...pick(before, fields),
          ...provided,
          id: before.id,
          expectedVersion: version(input.expectedVersion),
        },
        true,
      )
    : parseRecordWrite({ ...provided, studentId });
  if (before)
    ensure(
      fields.every(
        (key) =>
          Object.hasOwn(provided, key) ||
          isDeepStrictEqual(body[key], before[key]),
      ),
      "INVALID_INPUT",
    );
  return {
    path: `/api/learning-records/${command}`,
    method: before ? "PATCH" : "POST",
    body,
    preview: {
      targets: [project("students", target)],
      id: before?.id,
      expectedVersion: before?.version,
      occurredOn: body.occurredOn,
      category: body.category,
      impactCount: 1,
      changes: changes(before, body, Object.keys(provided)),
    },
    reconcile: async () =>
      before
        ? project("records", await find(request, "records", input))
        : pageResult(
            "records",
            await request(
              query("/api/learning-records/list", {
                studentId,
                category: body.category,
                dateFrom: body.occurredOn,
                dateTo: body.occurredOn,
                page: 1,
                pageSize: 100,
              }),
            ),
          ),
    verify: async (result) => {
      ensure(
        result.studentId === studentId && (!before || result.id === before.id),
        "VERIFY_FAILED",
      );
      const row = await find(request, "records", {
        studentId,
        id: positiveId(result.id),
      });
      ensure(
        row.version === (before?.version ?? 0) + 1 &&
          result.version === row.version &&
          matches(row, pick(body, fields)),
        "VERIFY_FAILED",
      );
      return {
        record: project("records", row),
        student: project("students", await student(request, studentId)),
      };
    },
  };
}
async function prepareAssignment(command, input, request) {
  if (command === "completion") {
    const before = await find(request, "assignments", input);
    checkVersion(before, input);
    const completed =
      input.completed === "true"
        ? true
        : input.completed === "false"
          ? false
          : input.completed;
    const body = parseAssignmentCompletion({
      id: before.id,
      completed,
      expectedVersion: version(input.expectedVersion),
    });
    return {
      path: "/api/task-assignments/completion",
      method: "PATCH",
      body,
      preview: {
        targets: [project("assignments", before)],
        expectedVersion: before.version,
        impactCount: 1,
        completed,
      },
      reconcile: async () =>
        project("assignments", await find(request, "assignments", input)),
      verify: async (result) => {
        const row = await find(request, "assignments", input);
        const status = completed ? "completed" : "pending";
        ensure(
          result.id === before.id &&
            result.version === row.version &&
            row.version ===
              before.version + (before.status === status ? 0 : 1) &&
            row.status === status &&
            (completed ? row.completedAt !== null : row.completedAt === null) &&
            row.dueDate === before.dueDate,
          "VERIFY_FAILED",
        );
        return project("assignments", row);
      },
    };
  }
  const studentIds =
    typeof input.studentIds === "string"
      ? input.studentIds.split(",")
      : input.studentIds;
  const body = parseAssignmentBatch({
    taskId: input.taskId,
    studentIds,
    dueDate: input.dueDate,
  });
  const task = await request(query("/api/tasks/detail", { id: body.taskId }));
  ensure(task.id === body.taskId, "UNEXPECTED_RESPONSE");
  ensure(task.status === "enabled", "TASK_DISABLED");
  const options = await request(
    query("/api/students/options", { ids: body.studentIds.join(",") }),
  );
  ensure(
    options.items?.length === body.studentIds.length &&
      body.studentIds.every((id) => options.items.some((r) => r.id === id)),
    "NOT_FOUND",
  );
  const pending = await collect(request, "/api/task-assignments/list", {
    taskId: body.taskId,
    status: "pending",
  });
  ensure(
    !pending.some((row) => body.studentIds.includes(row.studentId)),
    "DUPLICATE_PENDING",
  );
  return {
    path: "/api/task-assignments/create-batch",
    method: "POST",
    body,
    preview: {
      targets: options.items.map((r) => project("students", r)),
      task: project("tasks", task),
      dueDate: body.dueDate,
      impactCount: body.studentIds.length,
      transaction: "全有或全无",
    },
    reconcile: async () => ({
      items: (
        await collect(request, "/api/task-assignments/list", {
          taskId: body.taskId,
        })
      )
        .filter((r) => body.studentIds.includes(r.studentId))
        .map((r) => project("assignments", r)),
    }),
    verify: async (result) => {
      ensure(
        result.createdCount === body.studentIds.length &&
          Array.isArray(result.assignmentIds) &&
          result.assignmentIds.length === body.studentIds.length &&
          new Set(result.assignmentIds).size === body.studentIds.length,
        "VERIFY_FAILED",
      );
      const rows = (
        await collect(request, "/api/task-assignments/list", {
          taskId: body.taskId,
        })
      ).filter((r) => result.assignmentIds.includes(r.id));
      ensure(
        rows.length === body.studentIds.length &&
          new Set(rows.map((r) => r.studentId)).size === rows.length &&
          rows.every(
            (r) =>
              body.studentIds.includes(r.studentId) &&
              r.taskId === body.taskId &&
              r.status === "pending" &&
              r.completedAt === null &&
              r.dueDate === body.dueDate &&
              r.version === 1,
          ),
        "VERIFY_FAILED",
      );
      return {
        assignmentIds: result.assignmentIds,
        createdCount: result.createdCount,
        items: rows.map((r) => project("assignments", r)),
      };
    },
  };
}
