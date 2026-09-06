import { effectScope, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudentProfile } from "../../app/composables/useStudentProfile";
import { ServiceError } from "../../app/services/http";
const api = vi.hoisted(() => ({
  createStudent: vi.fn(),
  getStudentEdit: vi.fn(),
  getStudents: vi.fn(),
  updateStudent: vi.fn(),
}));
vi.mock("~/services/students", () => api);
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  notifyStudentChange: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const original = {
  id: "1",
  version: 1,
  name: "合成",
  grade: "初一",
  school: "校",
  className: "班",
  gender: null,
  enrolledAt: null,
  guardianName: null,
  guardianPhone: "00000000000",
  note: null,
};
describe("S7 draft safety", () => {
  it("blocks invalid fields before API submission without losing the draft", async () => {
    const scope = effectScope();
    const state = scope.run(() => useStudentProfile(vi.fn()))!;
    await state.begin();
    state.draft.name = "😀".repeat(65);
    state.draft.grade = "初一";
    state.draft.guardianPhone = "invalid";
    await state.save();
    expect(api.createStudent).not.toHaveBeenCalled();
    expect(state.fieldErrors.value.name).toBeTruthy();
    expect(state.fieldErrors.value.guardianPhone).toBeTruthy();
    expect([...state.draft.name]).toHaveLength(65);
    scope.stop();
  });
  it("opens plaintext only on demand, preserves old draft/version on conflict until explicit begin", async () => {
    const scope = effectScope();
    const state = scope.run(() => useStudentProfile(vi.fn()))!;
    expect(api.getStudentEdit).not.toHaveBeenCalled();
    api.getStudentEdit.mockResolvedValue(original);
    await state.begin("1");
    state.draft.name = "我的草稿";
    api.updateStudent.mockRejectedValue(
      new ServiceError("冲突", 409, { code: "VERSION_CONFLICT" }),
    );
    await state.save();
    expect(state.conflict.value).toBe(true);
    expect(state.draft.name).toBe("我的草稿");
    expect(state.version.value).toBe(1);
    expect(api.updateStudent.mock.lastCall?.[0].guardianPhone).toBe(
      "00000000000",
    );
    await state.save();
    expect(api.updateStudent).toHaveBeenCalledTimes(1);
    api.getStudentEdit.mockResolvedValue({
      ...original,
      name: "最新",
      version: 2,
    });
    await state.begin("1");
    expect(state.draft.name).toBe("最新");
    expect(state.version.value).toBe(2);
    scope.stop();
  });
  it("requires explicit duplicate confirmation and resets it synchronously on matching field edits", async () => {
    const scope = effectScope();
    const state = scope.run(() => useStudentProfile(vi.fn()))!;
    await state.begin();
    Object.assign(state.draft, {
      ...original,
      id: undefined,
      version: undefined,
    });
    api.createStudent.mockRejectedValue(
      new ServiceError("可能重复", 409, {
        code: "STUDENT_POSSIBLE_DUPLICATE",
        candidates: [
          {
            id: "2",
            name: "合成",
            school: "校",
            className: "班",
            status: "待分配",
          },
        ],
      }),
    );
    await state.save();
    expect(
      api.createStudent.mock.lastCall?.[0].confirmPossibleDuplicate,
    ).toBeUndefined();
    expect(state.candidates.value).toHaveLength(1);
    await state.save(true);
    expect(api.createStudent.mock.lastCall?.[0].confirmPossibleDuplicate).toBe(
      true,
    );
    for (const field of ["name", "school", "className"] as const) {
      await state.save();
      state.draft[field] = "改变";
      expect(state.candidates.value).toEqual([]);
      expect(state.error.value).toBe("");
      const count = api.createStudent.mock.calls.length;
      await state.save(true);
      expect(api.createStudent).toHaveBeenCalledTimes(count);
    }
    scope.stop();
  });
  it("unknown result blocks retries and checking never discards the draft or resends", async () => {
    const scope = effectScope();
    const state = scope.run(() => useStudentProfile(vi.fn()))!;
    await state.begin();
    state.draft.name = "合成";
    state.draft.grade = "初一";
    api.createStudent.mockRejectedValue(new Error("transport"));
    await state.save();
    expect(state.uncertain.value).toBe(true);
    const networkError = state.error.value;
    state.draft.school = "更改匹配字段";
    expect(state.error.value).toBe(networkError);
    await state.save();
    expect(api.createStudent).toHaveBeenCalledTimes(1);
    api.getStudents.mockResolvedValue({ total: 1, items: [] });
    await state.checkUncertain();
    expect(state.draft.name).toBe("合成");
    expect(state.uncertain.value).toBe(true);
    scope.stop();
  });
  it("ignores stale prefill after switching/closing and blocks duplicate submit", async () => {
    const scope = effectScope();
    const saved = vi.fn();
    const state = scope.run(() => useStudentProfile(saved))!;
    let resolve!: (value: typeof original) => void;
    api.getStudentEdit.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const opening = state.begin("1");
    await state.begin();
    resolve(original);
    await opening;
    expect(state.editingId.value).toBeUndefined();
    expect(state.draft.name).toBe("");
    state.draft.name = "合成";
    state.draft.grade = "初一";
    let finish!: () => void;
    api.createStudent.mockReturnValue(
      new Promise((r) => {
        finish = () => r({ id: "2" });
      }),
    );
    const saving = state.save();
    await state.save();
    expect(api.createStudent).toHaveBeenCalledTimes(1);
    finish();
    await saving;
    await nextTick();
    expect(saved).toHaveBeenCalledOnce();
    expect(state.open.value).toBe(false);
    scope.stop();
  });
});
