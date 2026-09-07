import { effectScope, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLearningRecords } from "../../app/composables/useLearningRecords";
import { useStudentDetail } from "../../app/composables/useStudents";
import type { LearningRecord } from "../../types/api/learning-records";

// Execute mounting hooks inside effectScope; keep the real event subscriptions
// and disposal logic, without adding a DOM environment dependency.
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: (mounted: () => void) => mounted(),
}));
const api = vi.hoisted(() => ({
  getRecords: vi.fn(),
  getStudent: vi.fn(),
  updateRecord: vi.fn(),
  createRecord: vi.fn(),
  reloadRecord: vi.fn(),
}));
vi.mock("~/services/learning-records", () => api);
vi.mock("~/services/students", () => api);
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const row: LearningRecord = {
  id: "1",
  studentId: "2",
  author: { id: "3", name: "合成人员" },
  category: "缺",
  subject: "英语",
  content: "原文",
  occurredOn: "2000-01-01",
  createdAt: "2000-01-01T00:00:00Z",
  updatedAt: "2000-01-01T00:00:00Z",
  version: 1,
};
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};
describe("D03 real invalidation subscriptions", () => {
  it.each(["focus", "student-data-changed"])(
    "%s reloads both regions without overwriting draft or version",
    async (event) => {
      const target = new EventTarget();
      vi.stubGlobal("window", target);
      api.getRecords.mockResolvedValue({
        items: [row],
        total: 1,
        page: 1,
        pageSize: 5,
      });
      api.getStudent.mockResolvedValue({
        id: "2",
        lastFollowUp: "2000-01-01",
      });
      const scope = effectScope();
      const state = scope.run(() => ({
        records: useLearningRecords(() => "2"),
        detail: useStudentDetail(() => "2"),
      }))!;
      await flush();
      state.records.category.value = "缺";
      state.records.keyword.value = "文";
      state.records.dates.value = ["2000-01-01", "2000-01-05"];
      await flush();
      state.records.page.value = 2;
      await flush();
      state.records.begin(row);
      state.records.draft.content = "未保存草稿";
      const draft = { ...state.records.draft };
      api.getRecords.mockResolvedValue({
        items: [
          {
            ...row,
            version: 2,
            subject: "数学",
            content: "窗口B新文",
            occurredOn: "2000-01-03",
          },
        ],
        total: 6,
        page: 2,
        pageSize: 5,
      });
      api.getStudent.mockResolvedValue({
        id: "2",
        lastFollowUp: "2000-01-03",
      });
      const oldRecords = api.getRecords.mock.calls.length,
        oldDetail = api.getStudent.mock.calls.length;
      target.dispatchEvent(new Event(event));
      await flush();
      expect(api.getRecords).toHaveBeenCalledTimes(oldRecords + 1);
      expect(api.getStudent).toHaveBeenCalledTimes(oldDetail + 1);
      expect(state.records.items.value[0]?.occurredOn).toBe("2000-01-03");
      expect(state.detail.student.value?.lastFollowUp).toBe("2000-01-03");
      expect(state.records.draft).toEqual(draft);
      expect(state.records.editing.value?.version).toBe(1);
      expect(state.records.open.value).toBe(true);
      expect(api.getRecords.mock.lastCall?.[0]).toMatchObject({
        page: 2,
        keyword: "文",
        category: "缺",
        subject: undefined,
        dateFrom: "2000-01-01",
        dateTo: "2000-01-05",
      });
      expect(api.updateRecord).not.toHaveBeenCalled();
      expect(api.reloadRecord).not.toHaveBeenCalled();
      scope.stop();
      target.dispatchEvent(new Event(event));
      await flush();
      expect(api.getRecords).toHaveBeenCalledTimes(oldRecords + 1);
    },
  );
});
