import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "mysql2/promise";
import { parseTaskWrite, parseTaskUpdate } from "../../server/db/task-rules";
import { parseTaskPlanProgressMigration } from "../../server/db/safety";
import { createAssignmentBatch } from "../../server/db/task-assignments";
import { studentPlanProgress } from "../../server/db/study-plans";

const task = { title: "任务", subject: "英语", description: "说明" };

function approvedDb(execute: ReturnType<typeof vi.fn>) {
  return {
    execute,
    query: vi
      .fn()
      .mockResolvedValue([[{ current_database: "tutor_workspace" }]]),
  } as unknown as Connection;
}

describe("S11 task-plan progress", () => {
  it("allows only the approved additive migration", () => {
    const sql = readFileSync(
      "database/migrations/018_task_plan_progress.sql",
      "utf8",
    );
    expect(parseTaskPlanProgressMigration(sql)).toHaveLength(2);
    expect(() =>
      parseTaskPlanProgressMigration(sql.replace("RESTRICT", "CASCADE")),
    ).toThrow();
  });

  it("accepts only a nullable plan ID and never a client snapshot", () => {
    expect(
      parseTaskWrite({ ...task, studyPlanId: null }).studyPlanId,
    ).toBeNull();
    expect(
      parseTaskUpdate({
        ...task,
        id: "1",
        status: "enabled",
        expectedVersion: 1,
        studyPlanId: "2",
      }).studyPlanId,
    ).toBe("2");
    for (const studyPlanId of ["0", "01", "1 OR 1=1", 1])
      expect(() => parseTaskWrite({ ...task, studyPlanId })).toThrow();
    expect(() =>
      parseTaskWrite({ ...task, studyPlanIdSnapshot: "2" }),
    ).toThrow();
  });

  it("writes the locked task plan as every batch snapshot", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: "5",
            status: "enabled",
            study_plan_id: "9",
            study_plan_title: "计划 A",
          },
        ],
      ])
      .mockResolvedValueOnce([[{ id: "2" }]])
      .mockResolvedValueOnce([[{ student_id: "2" }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: "11" }]])
      .mockResolvedValueOnce([
        [
          {
            id: "11",
            student_id: "2",
            status: "pending",
            due_date: "2026-09-09",
            study_plan_id_snapshot: "9",
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await createAssignmentBatch(
      approvedDb(execute),
      { taskId: "5", studentIds: ["2"], dueDate: "2026-09-09" },
      "1",
    );
    expect(result).toMatchObject({
      assignmentIds: ["11"],
      createdCount: 1,
      planSnapshot: { id: "9", title: "计划 A" },
    });
    expect(execute.mock.calls[2]?.[0]).toContain("study_plan_students");
    expect(execute.mock.calls[4]?.[0]).toContain("study_plan_id_snapshot");
  });

  it("rejects a mixed batch before inserting any assignment", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [{ id: "5", status: "enabled", study_plan_id: "9" }],
      ])
      .mockResolvedValueOnce([[{ id: "2" }, { id: "3" }]])
      .mockResolvedValueOnce([[{ student_id: "2" }]]);
    await expect(
      createAssignmentBatch(
        approvedDb(execute),
        { taskId: "5", studentIds: ["2", "3"], dueDate: "2026-09-09" },
        "1",
      ),
    ).rejects.toMatchObject({
      code: "STUDENT_PLAN_NOT_LINKED",
      statusCode: 409,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("aggregates only immutable snapshots and preserves empty state", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ id: "2" }]])
      .mockResolvedValueOnce([
        [
          {
            plan_id: "9",
            title: "计划 A",
            completed_assignments: 1,
            total_assignments: 2,
          },
          {
            plan_id: "10",
            title: "计划 B",
            completed_assignments: 0,
            total_assignments: 0,
          },
        ],
      ]);
    const items = await studentPlanProgress(approvedDb(execute), "2");
    expect(items).toEqual([
      expect.objectContaining({ progressPercent: 50, progressState: "active" }),
      expect.objectContaining({
        progressPercent: null,
        progressState: "empty",
      }),
    ]);
    expect(execute.mock.calls[1]?.[0]).toContain("study_plan_id_snapshot");
    expect(execute.mock.calls[1]?.[0]).toContain("LIMIT 100");
  });
});
