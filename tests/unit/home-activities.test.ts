import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { homeTaskData } from "../../server/db/home-activities";
import { listHome } from "../../server/db/home";

describe("S12 home activities", () => {
  it("bounded pending projection, Unicode summary and safe mixed activity projection", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [1, 2, 3].map((id) => ({
          id: String(id),
          student_id: "9",
          task_title: "合成任务",
          due_date: "2026-09-14",
          version: 2,
          group_count: 4,
        })),
      ])
      .mockResolvedValueOnce([
        [
          {
            student_id: "9",
            source_id: "10",
            source_type: "learning_record_created",
            occurred_at: "2026-09-14 00:00:00.000",
            category: "缺",
            record_summary: "😀".repeat(60),
            content: "never project",
          },
          {
            student_id: "9",
            source_id: "9",
            source_type: "task_completed",
            occurred_at: "2026-09-13 00:00:00.000",
            task_title: "合成任务",
            description: "never project",
          },
        ],
      ]);
    const result = await homeTaskData(
      { execute } as never,
      ["9", "10"],
      "2026-09-14",
    );
    expect(result.pending.get("9")?.pendingCount).toBe(4);
    expect(result.pending.get("9")?.pendingTasks).toHaveLength(3);
    const activity = result.activities.get("9")![0]!;
    expect(activity.type).toBe("learning_record_created");
    if (activity.type === "learning_record_created")
      expect(Array.from(activity.recordSummary)).toHaveLength(48);
    expect(activity.occurredAt).toBe("2026-09-14T00:00:00.000Z");
    expect(JSON.stringify(result.activities.get("9"))).not.toContain(
      "never project",
    );
    expect(execute.mock.calls[0]![1]).toEqual(["9", "10", 6]);
    expect(execute.mock.calls[1]![1]).toEqual(["9", "10", "9", "10", 10]);
    const pendingSQL = execute.mock.calls[0]![0];
    expect(pendingSQL).toContain("a.status='pending'");
    expect(pendingSQL).toContain("a.due_date ASC,a.id ASC");
    const activitySQL = execute.mock.calls[1]![0];
    expect(activitySQL).toContain("UNION ALL");
    expect(activitySQL).toContain("r.created_at AS occurred_at");
    expect(activitySQL).toContain("LEFT(r.content,48)");
    expect(activitySQL).toContain("completed_at IS NOT NULL");
    expect(activitySQL).toContain(
      "occurred_at DESC,source_id DESC,source_type DESC",
    );
    expect(activitySQL).not.toMatch(
      /updated_at|occurred_on|author_user_id|guardian/,
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("empty pages do not aggregate; advisor scope is applied before pagination and top count", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 4 }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const page = await listHome(
      { execute } as never,
      {
        page: 2,
        pageSize: 20,
        grade: "初一",
        tag: "跟进",
        subjectMode: "all",
      },
      { role: "advisor", userId: "99" },
    );
    expect(page).toMatchObject({ activeStudents: 4, total: 0, items: [] });
    expect(execute.mock.calls[0]![1]).toEqual(["99"]);
    expect(execute.mock.calls[2]![1]).toEqual(["99", "初一", "跟进", 20, 20]);
    for (const [sql] of execute.mock.calls)
      expect(sql).toContain("owner_user_id=?");
    expect(execute).toHaveBeenCalledTimes(3);
    await homeTaskData({ execute } as never, [], "2026-09-14");
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("aggregation errors reject the entire read, never fabricate activity", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      homeTaskData({ execute } as never, ["1"], "2026-09-14"),
    ).rejects.toThrow("offline");
  });
  it("card has keyboard navigation and nested interaction guards, no completed group", () => {
    const source = readFileSync("app/components/HomeStudentCard.vue", "utf8");
    expect(source).toContain('role="link"');
    expect(source).toContain('tabindex="0"');
    expect(source).toContain("@click.stop @keydown.stop");
    expect(source).toContain('"Enter", " "');
    expect(source).toContain("event.target !== event.currentTarget");
    expect(source).toContain("暂无进行中任务");
    expect(source).toContain("暂无最新动态");
    expect(source).not.toMatch(
      /completedTasks|completedCount|detail-link|v-html/,
    );
  });
});
