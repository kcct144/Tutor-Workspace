import { effectScope, nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { useStudentTags } from "../../app/composables/useStudentTags";
import { ServiceError } from "../../app/services/http";
const api = vi.hoisted(() => ({
  getStudentTags: vi.fn(),
  saveStudentTags: vi.fn(),
  invalidation: vi.fn(),
}));
vi.mock("~/services/student-tags", () => api);
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  notifyStudentChange: vi.fn(),
  useStudentInvalidation: api.invalidation,
}));
afterEach(() => vi.resetAllMocks());
it("preserves editing tags on focus/invalidation and conflict, until explicit reload", async () => {
  api.getStudentTags.mockResolvedValue({ id: "1", tags: ["体验"], version: 1 });
  const scope = effectScope();
  const state = scope.run(() => useStudentTags(() => "1"))!;
  await nextTick();
  await state.begin();
  state.draft.value = ["周末"];
  api.getStudentTags.mockResolvedValue({ id: "1", tags: ["新值"], version: 2 });
  await api.invalidation.mock.calls[0]![0]();
  expect(state.draft.value).toEqual(["周末"]);
  api.saveStudentTags.mockRejectedValue(new ServiceError("版本冲突", 409));
  await state.save();
  expect(state.draft.value).toEqual(["周末"]);
  expect(state.editing.value).toBe(true);
  await state.refresh();
  expect(state.draft.value).toEqual(["新值"]);
  scope.stop();
});
