import { describe, expect, it, vi } from "vitest";
import { runOperation, parseArgs } from "../../scripts/lib/data-cli.mjs";
import {
  apiClient,
  ToolError,
  localBase,
  safeValue,
  collect,
} from "../../scripts/lib/data-api.mjs";
import {
  parseStudentCreate,
  parseStudentUpdate,
  parseStudentStatus,
} from "../../server/db/student-profile-rules";
import { parseRecordWrite } from "../../server/db/learning-record-rules";
import {
  parseAssignmentBatch,
  parseAssignmentCompletion,
} from "../../server/db/assignment-rules";
import { shanghaiToday } from "../../server/db/contracts-rules";

function harness() {
  const original = {
    id: "101",
    name: "合成同名",
    grade: "初一",
    school: "合成甲校",
    className: "甲班",
    gender: "女",
    enrolledAt: "2000-01-01",
    guardianName: "合成监护人",
    guardianPhone: "00000000000",
    note: "保留备注",
    status: "在读",
    version: 3,
    owner: null,
    subjects: ["合成数学"],
    plans: [{ id: "501", title: "合成计划" }],
    expiryDate: null,
    lastFollowUp: "2000-01-02",
  };
  const students = [
    structuredClone(original),
    { ...structuredClone(original), id: "102", school: "合成乙校" },
  ];
  const records = [
    {
      id: "201",
      studentId: "101",
      category: "缺",
      content: "原正文",
      occurredOn: "2000-01-02",
      version: 2,
      author: { id: "1", name: "内部人员" },
    },
  ];
  const tasks = [
    {
      id: "301",
      title: "合成任务",
      subject: "合成数学",
      description: "合成说明",
      status: "enabled",
      version: 1,
    },
  ];
  const assignments = [
    {
      id: "401",
      studentId: "101",
      taskId: "301",
      studentName: "合成同名",
      taskTitle: "合成任务",
      subject: "合成数学",
      description: "合成说明",
      status: "pending",
      dueDate: shanghaiToday(),
      completedAt: null as string | null,
      version: 1,
    },
  ];
  const related = [{ id: "601", studentId: "101", subject: "合成数学" }];
  const detail = (row: typeof original) => {
    const { guardianPhone, ...safe } = row;
    return {
      ...safe,
      guardianPhoneMasked: guardianPhone ? "000****0000" : null,
    };
  };
  const calls: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
  }[] = [];
  const request = vi.fn(
    async (path: string, method = "GET", body?: Record<string, unknown>) => {
      calls.push({ path, method, body });
      const url = new URL(path, "http://127.0.0.1");
      const q = Object.fromEntries(url.searchParams);
      const route = url.pathname;
      const page = (items: object[]) => ({
        items,
        total: items.length,
        page: Number(q.page ?? 1),
        pageSize: Number(q.pageSize ?? 8),
      });
      if (method === "GET") {
        if (
          route === "/api/students/edit" ||
          route === "/api/students/detail"
        ) {
          const row = students.find((s) => s.id === q.id);
          if (!row) throw new ToolError("NOT_FOUND");
          return structuredClone(route.endsWith("edit") ? row : detail(row));
        }
        if (route === "/api/students/list") return page(students.map(detail));
        if (route === "/api/students/options")
          return page(
            students
              .filter((s) => q.ids.split(",").includes(s.id))
              .map(({ id, name, grade }) => ({ id, name, grade })),
          );
        if (route === "/api/learning-records/list")
          return page(
            structuredClone(records.filter((r) => r.studentId === q.studentId)),
          );
        if (route === "/api/contracts/list")
          return page(structuredClone(related));
        if (route === "/api/study-plans/list")
          return page([{ id: "501", title: "合成计划", version: 1 }]);
        if (route === "/api/study-plans/detail")
          return {
            id: q.id,
            title: "合成计划",
            content: "安全正文",
            version: 1,
          };
        if (route === "/api/tasks/detail") return structuredClone(tasks[0]);
        if (route === "/api/tasks/list") return page(structuredClone(tasks));
        if (route === "/api/task-assignments/list")
          return page(
            structuredClone(
              assignments.filter(
                (a) =>
                  (!q.studentId || a.studentId === q.studentId) &&
                  (!q.taskId || a.taskId === q.taskId) &&
                  (!q.status || a.status === q.status),
              ),
            ),
          );
      }
      if (route === "/api/students/create") {
        const input = parseStudentCreate(body);
        const row = {
          ...original,
          ...input,
          id: "103",
          status: "待分配",
          version: 1,
          owner: null,
          subjects: [],
          plans: [],
          expiryDate: null,
          lastFollowUp: null,
        };
        students.push(row);
        return detail(row);
      }
      if (
        route === "/api/students/update" ||
        route === "/api/students/status"
      ) {
        const input = route.endsWith("update")
          ? parseStudentUpdate(body)
          : parseStudentStatus(body);
        const row = students.find((s) => s.id === input.id)!;
        if (row.version !== input.expectedVersion)
          throw new ToolError("VERSION_CONFLICT");
        const increment = !("status" in input && row.status === input.status);
        const { id: _id, expectedVersion: _version, ...fields } = input;
        Object.assign(row, fields, {
          version: row.version + Number(increment),
        });
        return detail(row);
      }
      if (route === "/api/learning-records/update") {
        const input = parseRecordWrite(body, true);
        const row = records.find((r) => r.id === input.id)!;
        if (row.version !== input.expectedVersion)
          throw new ToolError("VERSION_CONFLICT");
        Object.assign(row, {
          content: input.content,
          category: input.category,
          occurredOn: input.occurredOn,
          version: row.version + 1,
        });
        return structuredClone(row);
      }
      if (route === "/api/learning-records/create") {
        const input = parseRecordWrite(body);
        const row = {
          ...input,
          id: "202",
          version: 1,
          author: { id: "1", name: "内部人员" },
        };
        records.push(row);
        return structuredClone(row);
      }
      if (route === "/api/task-assignments/create-batch") {
        const input = parseAssignmentBatch(body);
        if (
          assignments.some(
            (a) =>
              a.taskId === input.taskId &&
              input.studentIds.includes(a.studentId) &&
              a.status === "pending",
          )
        )
          throw new ToolError("VERSION_CONFLICT");
        const created = input.studentIds.map((studentId, index) => ({
          ...assignments[0]!,
          id: String(410 + index),
          studentId,
          dueDate: input.dueDate,
          status: "pending",
          version: 1,
          completedAt: null,
        }));
        assignments.push(...created);
        return {
          assignmentIds: created.map((r) => r.id),
          createdCount: created.length,
        };
      }
      if (route === "/api/task-assignments/completion") {
        const input = parseAssignmentCompletion(body);
        const row = assignments.find((a) => a.id === input.id)!;
        if (row.version !== input.expectedVersion)
          throw new ToolError("VERSION_CONFLICT");
        const status = input.completed ? "completed" : "pending";
        if (row.status !== status)
          Object.assign(row, {
            status,
            completedAt: input.completed ? "2026-09-06T00:00:00Z" : null,
            version: row.version + 1,
          });
        return structuredClone(row);
      }
      throw new ToolError("NOT_FOUND");
    },
  );
  const emit = vi.fn();
  const preflight = vi.fn(async () => ({
    databaseApproved: true,
    actorReady: true,
  }));
  return {
    original,
    students,
    records,
    tasks,
    assignments,
    related,
    request,
    calls,
    emit,
    preflight,
    run: (domain: string, args: string[], input?: object) =>
      runOperation(domain, args, { request, emit, preflight, input }),
  };
}
const apply = ["--apply", "--confirm"];
describe("data operations: safe workflow, isolated in-memory API", () => {
  it("student create previews by default, verifies fixed defaults and exposes no contact", async () => {
    const h = harness();
    await h.run("students", [
      "create",
      "--name",
      "合成新增",
      "--grade",
      "初一",
    ]);
    expect(h.calls).toHaveLength(0);
    await h.run("students", [
      "create",
      "--name",
      "合成新增",
      "--grade",
      "初一",
      ...apply,
    ]);
    expect(h.students[2]).toMatchObject({
      status: "待分配",
      version: 1,
      owner: null,
      school: null,
      guardianPhone: null,
    });
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "saved",
      verified: true,
      impactCount: 1,
    });
    const sent = h.calls.find((c) => c.method === "POST")!.body!;
    for (const key of ["status", "owner", "actorId", "version"])
      expect(sent).not.toHaveProperty(key);
  });
  it("selects stable IDs among same names, preserves every omitted field and phone", async () => {
    const h = harness();
    await h.run("students", ["list", "--keyword", "合成同名"]);
    await h.run("students", [
      "update",
      "--id",
      "102",
      "--expected-version",
      "3",
      "--name",
      "新合成名",
    ]);
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
    await h.run("students", [
      "update",
      "--id",
      "102",
      "--expected-version",
      "3",
      "--name",
      "新合成名",
      ...apply,
    ]);
    expect(h.students[0]).toEqual(h.original);
    expect(h.students[1]).toEqual({
      ...h.original,
      id: "102",
      school: "合成乙校",
      name: "新合成名",
      version: 4,
    });
    const sent = h.calls.find((c) => c.method === "PATCH")!.body!;
    expect(sent.guardianPhone).toBe(h.original.guardianPhone);
    expect(JSON.stringify(h.emit.mock.calls)).not.toContain(
      h.original.guardianPhone,
    );
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "saved",
      verified: true,
      impactCount: 1,
    });
  });
  it("explicit clear only, stdout hides stdin contact and dates remain exact", async () => {
    const h = harness();
    await h.run("students", [
      "update",
      "--id",
      "101",
      "--expected-version",
      "3",
      "--clear",
      "school,guardian-phone",
      ...apply,
    ]);
    expect(h.students[0]).toMatchObject({
      school: null,
      guardianPhone: null,
      className: "甲班",
      note: "保留备注",
    });
    await h.run(
      "students",
      [
        "update",
        "--id",
        "101",
        "--expected-version",
        "4",
        "--input-stdin",
        ...apply,
      ],
      { guardianPhone: "00000012345", enrolledAt: "2001-02-03" },
    );
    expect(JSON.stringify(h.emit.mock.calls)).not.toContain("00000012345");
    expect(JSON.stringify(h.emit.mock.calls)).toContain("2001-02-03");
    await expect(
      h.run("students", [
        "update",
        "--id",
        "101",
        "--expected-version",
        "5",
        "--school",
        "",
      ]),
    ).rejects.toThrow();
  });
  it("old version never writes and concurrent API conflict is re-read without retry", async () => {
    const h = harness();
    await expect(
      h.run("students", [
        "update",
        "--id",
        "101",
        "--expected-version",
        "2",
        "--name",
        "草稿",
        ...apply,
      ]),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
    const request = async (
      path: string,
      method = "GET",
      body?: Record<string, unknown>,
    ) => {
      if (method !== "GET") throw new ToolError("VERSION_CONFLICT");
      return h.request(path, method, body);
    };
    await expect(
      runOperation(
        "students",
        [
          "update",
          "--id",
          "101",
          "--expected-version",
          "3",
          "--name",
          "草稿",
          ...apply,
        ],
        { request, emit: h.emit, preflight: h.preflight },
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(
      h.emit.mock.calls.some(
        ([r]) => r.phase === "conflict" && r.verified === false,
      ),
    ).toBe(true);
  });
  it("graduation leaves all associated data intact and verifies read-back", async () => {
    const h = harness();
    const before = structuredClone([h.records, h.assignments, h.related]);
    await h.run("students", [
      "status",
      "--id",
      "101",
      "--expected-version",
      "3",
      "--status",
      "已结课",
      ...apply,
    ]);
    expect([h.records, h.assignments, h.related]).toEqual(before);
    expect(h.students[0].status).toBe("已结课");
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "saved",
      verified: true,
    });
  });
  it("record single-field edit preserves date, category, student and author", async () => {
    const h = harness();
    await h.run("records", [
      "update",
      "--student-id",
      "101",
      "--id",
      "201",
      "--expected-version",
      "2",
      "--content",
      "新正文",
      ...apply,
    ]);
    expect(h.records[0]).toMatchObject({
      studentId: "101",
      category: "缺",
      occurredOn: "2000-01-02",
      version: 3,
      author: { id: "1" },
      content: "新正文",
    });
    await expect(
      h.run("records", [
        "update",
        "--student-id",
        "102",
        "--id",
        "201",
        "--expected-version",
        "3",
        "--content",
        "错误",
        ...apply,
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await h.run("records", [
      "create",
      "--student-id",
      "101",
      "--category",
      "补",
      "--occurred-on",
      "2000-01-03",
      "--content",
      "合成记录",
      ...apply,
    ]);
    expect(h.records).toHaveLength(2);
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "saved",
      verified: true,
    });
  });
  it("duplicate pending blocked, distinct student batch accepted, completion is explicit", async () => {
    const h = harness();
    await expect(
      h.run("tasks", [
        "assign",
        "--task-id",
        "301",
        "--student-ids",
        "101",
        "--due-date",
        shanghaiToday(),
        ...apply,
      ]),
    ).rejects.toMatchObject({ code: "DUPLICATE_PENDING" });
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
    await h.run("tasks", [
      "assign",
      "--task-id",
      "301",
      "--student-ids",
      "102",
      "--due-date",
      shanghaiToday(),
      ...apply,
    ]);
    expect(h.assignments).toHaveLength(2);
    await h.run("tasks", [
      "completion",
      "--student-id",
      "101",
      "--task-id",
      "301",
      "--id",
      "401",
      "--expected-version",
      "1",
      "--completed",
      "true",
      ...apply,
    ]);
    expect(h.assignments[0]).toMatchObject({ status: "completed", version: 2 });
    await h.run("tasks", [
      "completion",
      "--student-id",
      "101",
      "--task-id",
      "301",
      "--id",
      "401",
      "--expected-version",
      "2",
      "--completed",
      "false",
      ...apply,
    ]);
    expect(h.assignments[0]).toMatchObject({
      status: "pending",
      version: 3,
      completedAt: null,
    });
  });
  it("server assignment race is a definite rejection, reconciled without retry", async () => {
    const h = harness();
    let posts = 0;
    const request = async (
      path: string,
      method = "GET",
      body?: Record<string, unknown>,
    ) => {
      if (method === "POST") {
        posts++;
        throw new ToolError("ASSIGNMENT_CONFLICT");
      }
      return h.request(path, method, body);
    };
    await expect(
      runOperation(
        "tasks",
        [
          "assign",
          "--task-id",
          "301",
          "--student-ids",
          "102",
          "--due-date",
          shanghaiToday(),
          ...apply,
        ],
        { request, emit: h.emit, preflight: h.preflight },
      ),
    ).rejects.toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
    expect(posts).toBe(1);
    expect(h.assignments).toHaveLength(1);
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "conflict",
      impactCount: 0,
      retry: false,
    });
  });
  it("unknown submission outcome triggers reads, never a second write or success claim", async () => {
    const h = harness();
    let writes = 0;
    const request = async (
      path: string,
      method = "GET",
      body?: Record<string, unknown>,
    ) => {
      if (method !== "GET") {
        writes++;
        await h.request(path, method, body);
        throw new ToolError("RESULT_UNKNOWN", true);
      }
      return h.request(path, method, body);
    };
    await expect(
      runOperation(
        "students",
        [
          "update",
          "--id",
          "101",
          "--expected-version",
          "3",
          "--name",
          "已到服务端",
          ...apply,
        ],
        { request, emit: h.emit, preflight: h.preflight },
      ),
    ).rejects.toMatchObject({ code: "RESULT_UNKNOWN" });
    expect(writes).toBe(1);
    expect(h.students[0].version).toBe(4);
    expect(
      h.emit.mock.calls.some(
        ([r]) => r.phase === "result-unknown" && r.verified === false,
      ),
    ).toBe(true);
    expect(h.emit.mock.calls.some(([r]) => r.phase === "saved")).toBe(false);
  });
  it("failed read-back never claims full success", async () => {
    const h = harness();
    let written = false;
    const request = async (
      path: string,
      method = "GET",
      body?: Record<string, unknown>,
    ) => {
      if (written) throw new ToolError("SERVICE_UNAVAILABLE");
      const r = await h.request(path, method, body);
      if (method !== "GET") written = true;
      return r;
    };
    await expect(
      runOperation(
        "students",
        [
          "update",
          "--id",
          "101",
          "--expected-version",
          "3",
          "--name",
          "合成改名",
          ...apply,
        ],
        { request, emit: h.emit, preflight: h.preflight },
      ),
    ).rejects.toMatchObject({ code: "VERIFY_FAILED" });
    expect(h.emit.mock.lastCall?.[0]).toMatchObject({
      phase: "saved-unverified",
      verified: false,
      retry: false,
    });
  });
  it("approved database prerequisite fails closed before API", async () => {
    const h = harness();
    h.preflight.mockResolvedValue({
      databaseApproved: false,
      actorReady: false,
    });
    await expect(
      h.run("students", [
        "status",
        "--id",
        "101",
        "--expected-version",
        "3",
        "--status",
        "已结课",
        ...apply,
      ]),
    ).rejects.toMatchObject({ code: "PREFLIGHT_FAILED" });
    expect(h.request).not.toHaveBeenCalled();
  });
  it("contracts and plans expose read-only script paths", async () => {
    const h = harness();
    await h.run("contracts", ["list", "--student-id", "101"]);
    await h.run("plans", ["get", "--id", "501"]);
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
    expect(() => parseArgs("plans", ["update", "--id", "501"])).toThrow();
  });
});
describe("transport and parameter safety", () => {
  it("rejects unknown, duplicate, authority and incomplete confirmation args", () => {
    for (const args of [
      ["delete", "--id", "1"],
      ["update", "--id", "1", "--actor-id", "1"],
      ["status", "--id", "1", "--id", "2"],
      ["status", "--apply"],
      ["status", "--confirm"],
      ["update", "--guardian-phone", "00000000000"],
    ])
      expect(() => parseArgs("students", args)).toThrow();
    expect(() =>
      parseArgs("students", ["update", "--input-stdin"], { ownerUserId: "1" }),
    ).toThrow();
  });
  it("restricts local origin and disallows credentials, redirects and configuration in errors", async () => {
    for (const url of [
      "https://127.0.0.1:3000",
      "http://example.com",
      "http://user:secret@127.0.0.1",
      "http://127.0.0.1/path",
      "http://127.0.0.1/?password=secret",
      "http://0.0.0.0:3000",
    ])
      expect(() => localBase(url)).toThrow();
    expect(localBase("http://localhost:3000").hostname).toBe("127.0.0.1");
    const fetcher = vi.fn(
      async (_url: URL, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            status: "error",
            msg: "SQL password 00000000000",
            data: { code: "VERSION_CONFLICT" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      apiClient("http://127.0.0.1:3000", fetcher, {
        sessionProvider: async () => ({
          baseUrl: "http://127.0.0.1:3000",
          sessionToken: "a".repeat(43),
          csrfToken: "b".repeat(43),
        }),
      })("/api/students/update", "PATCH", {}),
    ).rejects.toMatchObject({ message: "VERSION_CONFLICT", uncertain: false });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });
  it("bounds lookup and redacts arbitrary phone-like text/control escapes", async () => {
    await expect(
      collect(
        async () => ({ items: [], total: 2001, page: 1, pageSize: 100 }),
        "/api/learning-records/list",
        { studentId: "1" },
      ),
    ).rejects.toMatchObject({ code: "LOOKUP_LIMIT" });
    const safe = JSON.stringify(
      safeValue({
        note: "tel +00 (000) 000-000\u001b[31m",
        guardianPhone: "00000000000",
        dueDate: "2026-09-06",
      }),
    );
    expect(safe).not.toContain("000");
    expect(safe).not.toContain("31m");
    expect(safe).toContain("2026-09-06");
  });
});
