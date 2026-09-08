import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Connection } from "mysql2/promise";
import {
  parseAssignmentBatch,
  parseAssignmentQuery,
  parseAssignmentCompletion,
  assignmentDueState,
  parseHomeQuery,
} from "../../server/db/assignment-rules";
import {
  createAssignmentBatch,
  completeAssignment,
  studentAssignmentSummaries,
  taskAssignmentCounts,
} from "../../server/db/task-assignments";
import { parseMigration } from "../../server/db/safety";
import { listHome } from "../../server/db/home";
const today = "2026-09-06";
const rawRow = {
  id: "1",
  task_id: "1",
  student_id: "1",
  task_title: "任务",
  description: "说明",
  subject: "科目",
  student_name: "合成",
  status: "pending",
  due_date: today,
  assigned_at: "2000-01-01 00:00:00.000",
  created_at: "2000-01-01 00:00:00.000",
  updated_at: "2000-01-01 00:00:00.000",
  completed_at: null,
  version: 1,
};
const guard = () =>
  vi.fn().mockResolvedValue([[{ current_database: "tutor_workspace" }]]);
describe("S6 input and data rules", () => {
  it("1/100 accepted,0/101/duplicates rejected, dates server authoritative", () => {
    for (const n of [1, 100])
      expect(
        parseAssignmentBatch(
          {
            taskId: "1",
            studentIds: Array.from({ length: n }, (_, i) => String(i + 1)),
            dueDate: today,
          },
          today,
        ).studentIds,
      ).toHaveLength(n);
    for (const ids of [
      [],
      ["1", "1"],
      Array.from({ length: 101 }, (_, i) => String(i + 1)),
    ])
      expect(() =>
        parseAssignmentBatch(
          { taskId: "1", studentIds: ids, dueDate: today },
          today,
        ),
      ).toThrow();
    for (const date of ["2026-09-05", "2026-02-30", "bad"])
      expect(() =>
        parseAssignmentBatch(
          { taskId: "1", studentIds: ["1"], dueDate: date },
          today,
        ),
      ).toThrow();
    expect(
      parseAssignmentBatch(
        { taskId: "1", studentIds: ["1"], dueDate: "2026-09-07" },
        today,
      ).dueDate,
    ).toBe("2026-09-07");
  });
  it("rejects unknown identity/date fields and invalid paging/enums/IDs", () => {
    for (const key of ["assignedBy", "actorId", "owner", "status", "today"])
      expect(() =>
        parseAssignmentBatch(
          { taskId: "1", studentIds: ["1"], dueDate: today, [key]: "1" },
          today,
        ),
      ).toThrow();
    for (const q of [
      { status: "completed " },
      { dueState: "expired" },
      { page: "0" },
      { pageSize: "101" },
      { taskId: "01" },
      { studentId: "0" },
      { keyword: "x".repeat(65) },
      { asOfDate: today },
      { subject: "" },
    ])
      expect(() => parseAssignmentQuery(q)).toThrow();
    for (const input of [
      { id: "1", completed: 1, expectedVersion: 1 },
      { id: "1", completed: true, expectedVersion: 0 },
      { id: "1", completed: true, expectedVersion: 1, actorId: "1" },
    ])
      expect(() => parseAssignmentCompletion(input)).toThrow();
    expect(parseHomeQuery({ grade: "初一" })).toEqual({
      page: 1,
      pageSize: 20,
      grade: "初一",
    });
    expect(() => parseHomeQuery({ status: "在读" })).toThrow();
  });
  it("overdue only pending and boundary dates", () => {
    expect(assignmentDueState("pending", "2026-09-05", today)).toBe("overdue");
    expect(assignmentDueState("pending", today, today)).toBe("today");
    expect(assignmentDueState("pending", "2026-09-07", today)).toBe("upcoming");
    expect(assignmentDueState("completed", "2000-01-01", today)).toBeNull();
  });
  it("migration only minimal assignment schema and restrict constraints", () => {
    const sql = readFileSync(
      "database/migrations/006_task_assignments.sql",
      "utf8",
    );
    expect(
      parseMigration(sql, ["task_assignments"], ["tasks", "students", "users"]),
    ).toHaveLength(1);
    expect(sql).toContain(
      "UNIQUE KEY uq_assignments_pending (task_id, student_id, pending_marker)",
    );
    expect(sql).toContain("completed_at IS NULL");
    expect(sql).not.toMatch(/snapshot|title|description|DROP|ALTER/);
  });
  it("100 students use one bulk insert after lock and bounded existence/conflict checks", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [{ id: "1", status: "enabled", study_plan_id: null }],
      ])
      .mockResolvedValueOnce([ids.map((id) => ({ id }))])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 100 }])
      .mockResolvedValueOnce([ids.map((id) => ({ id }))])
      .mockResolvedValueOnce([
        ids.map((id) => ({
          id,
          student_id: id,
          status: "pending",
          due_date: today,
          study_plan_id_snapshot: null,
        })),
      ])
      .mockResolvedValue([{ affectedRows: 1 }]);
    const query = guard(),
      db = { execute, query } as unknown as Connection;
    expect(
      (
        await createAssignmentBatch(
          db,
          { taskId: "1", studentIds: ids, dueDate: today },
          "1",
        )
      ).createdCount,
    ).toBe(100);
    expect(execute.mock.calls[0]![0]).toContain("FOR UPDATE");
    expect(execute.mock.calls[3]![1]).toHaveLength(500);
    expect(
      execute.mock.calls.filter((call) =>
        String(call[0]).startsWith("INSERT INTO task_assignments"),
      ),
    ).toHaveLength(1);
    expect(
      execute.mock.calls.filter((call) =>
        String(call[0]).startsWith("INSERT INTO audit_logs"),
      ),
    ).toHaveLength(100);
    expect(query).toHaveBeenCalled();
  });
  it("no-op is exact-version only; competing completed update remains 409", async () => {
    for (const version of [1, 2]) {
      const db = {
        query: guard(),
        execute: vi
          .fn()
          .mockResolvedValueOnce([{ affectedRows: 0 }])
          .mockResolvedValueOnce([
            [
              {
                ...rawRow,
                status: "completed",
                completed_at: "2000-01-01 00:00:00.000",
                version,
              },
            ],
          ]),
      } as unknown as Connection;
      const result = completeAssignment(
        db,
        { id: "1", completed: true, expectedVersion: 1 },
        "1",
        today,
      );
      if (version === 1) expect((await result).version).toBe(1);
      else await expect(result).rejects.toMatchObject({ statusCode: 409 });
    }
  });
  it("unique restore maps409 and never accepts unknown errors", async () => {
    const db = {
      query: guard(),
      execute: vi.fn().mockRejectedValue({ code: "ER_DUP_ENTRY" }),
    } as unknown as Connection;
    await expect(
      completeAssignment(
        db,
        { id: "1", completed: false, expectedVersion: 1 },
        "1",
        today,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("summary counts are independent of three rows; batched no N+1", async () => {
    const execute = vi.fn().mockResolvedValue([
      [
        { ...rawRow, group_count: 7 },
        { ...rawRow, id: "2", group_count: 7 },
        { ...rawRow, id: "3", group_count: 7 },
        {
          ...rawRow,
          id: "4",
          status: "completed",
          completed_at: "2000-01-01 00:00:00.000",
          group_count: 9,
        },
      ],
    ]);
    const result = await studentAssignmentSummaries(
      { execute } as unknown as Connection,
      ["1", "2"],
      today,
    );
    expect(result.get("1")).toMatchObject({
      pendingCount: 7,
      completedCount: 9,
    });
    expect(result.get("1")!.pendingTasks).toHaveLength(3);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toContain("ROW_NUMBER()");
    expect(execute.mock.calls[0]![1]).toEqual(["1", "2", 12]);
  });
  it("distinct student counts and empty home avoid per-student queries", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ task_id: "1", count: 2 }]]);
    expect(
      (
        await taskAssignmentCounts({ execute } as unknown as Connection, ["1"])
      ).get("1"),
    ).toBe(2);
    expect(execute.mock.calls[0]![0]).toContain("COUNT(DISTINCT student_id)");
    execute
      .mockResolvedValueOnce([[{ total: 4 }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const result = await listHome(
      { execute } as unknown as Connection,
      { page: 1, pageSize: 20, grade: "高二" },
      today,
    );
    expect(result).toMatchObject({ items: [], total: 0, activeStudents: 4 });
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
