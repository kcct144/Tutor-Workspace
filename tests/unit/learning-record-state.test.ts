import { effectScope, nextTick, ref } from "vue";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useLearningRecords } from "../../app/composables/useLearningRecords";
import { ServiceError } from "../../app/services/http";
import type { LearningRecord } from "../../types/api/learning-records";
const api = vi.hoisted(() => ({
  getRecords: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  reloadRecord: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("~/services/learning-records", () => api);
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  notifyStudentChange: notify,
  useStudentInvalidation: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const record: LearningRecord = {
  id: "1",
  studentId: "2",
  author: { id: "3", name: "合成人员" },
  category: "缺",
  subject: null,
  content: "原文",
  occurredOn: "2000-01-01",
  createdAt: "2000-01-01T00:00:00Z",
  updatedAt: "2000-01-01T00:00:00Z",
  version: 1,
};
const empty = { items: [], total: 0, page: 1, pageSize: 5 };
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
describe("S3 record form state", () => {
  it("preserves draft on conflict and only replaces it after explicit reload", async () => {
    api.getRecords.mockResolvedValue(empty);
    api.updateRecord.mockRejectedValue(new ServiceError("版本冲突", 409));
    const scope = effectScope(),
      state = scope.run(() => useLearningRecords(() => "2"))!;
    state.begin(record);
    state.draft.content = "草稿";
    state.draft.subject = "数学";
    await state.save();
    expect(state.open.value).toBe(true);
    expect(state.conflict.value).toBe(true);
    expect(state.draft.content).toBe("草稿");
    expect(api.updateRecord.mock.calls[0]![0].subject).toBe("数学");
    await state.save();
    expect(api.updateRecord).toHaveBeenCalledTimes(1);
    api.reloadRecord.mockResolvedValue({
      ...record,
      content: "新版本",
      subject: "英语",
      version: 2,
    });
    await state.reloadEditing();
    expect(state.draft.content).toBe("新版本");
    expect(state.draft.subject).toBe("英语");
    expect(state.editing.value?.version).toBe(2);
    expect(state.conflict.value).toBe(false);
    scope.stop();
  });
  it("blocks double save, retains a failed draft, notifies student refresh after success", async () => {
    api.getRecords.mockResolvedValue(empty);
    let resolve!: (value: LearningRecord) => void;
    api.createRecord.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const scope = effectScope(),
      state = scope.run(() => useLearningRecords(() => "2"))!;
    state.begin();
    Object.assign(state.draft, {
      category: "补",
      subject: "英语",
      content: "草稿",
      occurredOn: "2000-01-01",
    });
    const saving = state.save();
    await state.save();
    state.close();
    expect(state.open.value).toBe(true);
    expect(api.createRecord).toHaveBeenCalledTimes(1);
    expect(api.createRecord.mock.calls[0]![0].subject).toBe("英语");
    resolve(record);
    await saving;
    expect(notify).toHaveBeenCalledOnce();
    expect(state.open.value).toBe(false);
    api.createRecord.mockRejectedValueOnce(new ServiceError("保存失败", 503));
    state.begin();
    Object.assign(state.draft, { content: "保留", occurredOn: "2000-01-01" });
    await state.save();
    expect(state.draft.content).toBe("保留");
    expect(state.open.value).toBe(true);
    scope.stop();
  });
  it("resets paging, exposes errors, and isolates changed students and stale requests", async () => {
    api.getRecords.mockResolvedValue(empty);
    const id = ref("2"),
      scope = effectScope(),
      state = scope.run(() => useLearningRecords(() => id.value))!;
    await flush();
    state.page.value = 2;
    await flush();
    state.keyword.value = "筛选";
    await flush();
    expect(state.page.value).toBe(1);
    api.getRecords.mockRejectedValueOnce(new ServiceError("读取失败", 503));
    await state.refresh();
    expect(state.error.value).toBe("读取失败");
    expect(state.items.value).toEqual([]);
    let resolve!: (value: typeof empty) => void;
    api.getRecords.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const old = state.refresh();
    state.begin(record);
    id.value = "4";
    await flush();
    resolve({ ...empty, total: 99 });
    await old;
    expect(state.total.value).toBe(0);
    expect(state.open.value).toBe(false);
    expect(state.editing.value).toBeNull();
    scope.stop();
  });
});
