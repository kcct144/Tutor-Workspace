import { describe, it, expect, vi } from "vitest";
import { effectScope } from "vue";
import { readFileSync } from "node:fs";
import { useStudentTasks } from "../../app/composables/useStudentTasks";

const { getAssignments } = vi.hoisted(() => ({ getAssignments: vi.fn() }));
vi.mock("~/services/task-assignments", () => ({ getAssignments }));

describe("home card quick actions", () => {
  it("loads the student's full task list and splits pending from completed", async () => {
    getAssignments.mockReset();
    getAssignments.mockResolvedValue({
      items: [
        { id: "1", status: "pending", taskTitle: "待办A", subject: "英语" },
        { id: "2", status: "completed", taskTitle: "完成B", subject: "数学" },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    const scope = effectScope();
    const state = scope.run(() => useStudentTasks(() => "9"))!;
    await state.refresh();
    expect(getAssignments).toHaveBeenCalledWith(
      { studentId: "9", page: 1, pageSize: 100 },
      expect.any(AbortSignal),
    );
    expect(state.loading.value).toBe(false);
    expect(state.error.value).toBe("");
    expect(state.pending.value.map((task) => task.id)).toEqual(["1"]);
    expect(state.completed.value.map((task) => task.id)).toEqual(["2"]);
    scope.stop();
  });

  it("surfaces load failures without fabricating tasks", async () => {
    getAssignments.mockReset();
    getAssignments.mockImplementation(() => {
      throw new Error("offline");
    });
    const scope = effectScope();
    const state = scope.run(() => useStudentTasks(() => "9"))!;
    await state.refresh();
    expect(getAssignments).toHaveBeenCalledTimes(1);
    expect(state.error.value).toBe("任务加载失败，请重试。");
    expect(state.pending.value).toEqual([]);
    expect(state.completed.value).toEqual([]);
    scope.stop();
  });

  it("card wires the hover popover and the + button without hijacking card navigation", () => {
    const card = readFileSync("app/components/HomeStudentCard.vue", "utf8");
    expect(card).toContain("StudentTasksPopover");
    expect(card).toContain('v-model:open="taskListOpen"');
    expect(card).toContain("全部任务");
    expect(card).toContain("quickRecord");
    expect(card).toContain("@click.stop=\"emit('quickRecord', student)\"");
    expect(card).toContain('role="link"');
  });

  it("popover component offers hover trigger and both task groups", () => {
    const popover = readFileSync(
      "app/components/StudentTasksPopover.vue",
      "utf8",
    );
    expect(popover).toContain('trigger="hover"');
    expect(popover).toContain("待办任务");
    expect(popover).toContain("已完成任务");
  });

  it("quick record dialog defaults to 缺 / 英语 / today and reuses the record API", () => {
    const dialog = readFileSync("app/components/QuickRecordDialog.vue", "utf8");
    expect(dialog).toContain('category: "缺"');
    expect(dialog).toContain('subject: "英语"');
    expect(dialog).toContain("shanghaiToday()");
    expect(dialog).toContain("createRecord");
    expect(dialog).toContain("notifyStudentChange");
  });

  it("home page opens the dialog from the card event", () => {
    const page = readFileSync("app/pages/index.vue", "utf8");
    expect(page).toContain('@quick-record="beginQuickRecord"');
    expect(page).toContain("QuickRecordDialog");
  });
});
