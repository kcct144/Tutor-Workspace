import { effectScope, nextTick } from "vue";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { PlanDetail } from "../../types/api/study-plans";
import { useStudyPlans } from "../../app/composables/useStudyPlans";
import { ServiceError } from "../../app/services/http";
const api = vi.hoisted(() => ({
  getPlans: vi.fn(),
  getPlan: vi.fn(),
  updatePlan: vi.fn(),
}));
vi.mock("~/services/study-plans", () => api);
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: () => {},
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const plan: PlanDetail = {
  id: "1",
  title: "计划",
  summary: null,
  content: "原文",
  version: 1,
  createdAt: "2000-01-01T00:00:00Z",
  updatedAt: "2000-01-01T00:00:00Z",
  owner: { id: "1", name: "合成人员" },
};
const empty = { items: [], total: 0, page: 1, pageSize: 20 };
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
function setup() {
  api.getPlans.mockResolvedValue(empty);
  api.getPlan.mockResolvedValue(plan);
  vi.stubGlobal("window", {
    confirm: vi.fn(() => true),
    removeEventListener: vi.fn(),
  });
  const scope = effectScope();
  return { scope, state: scope.run(() => useStudyPlans())! };
}
describe("S4 plan state", () => {
  it("an aborted conflict reload cannot replace a newly selected document draft", async () => {
    const { scope, state } = setup();
    await state.selectPlan("1");
    state.startEditing();
    state.draftContent.value = "旧草稿";
    let resolve!: (value: PlanDetail) => void;
    api.getPlan.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = state.reloadLatest();
    api.getPlan.mockResolvedValueOnce({ ...plan, id: "2" });
    await state.selectPlan("2");
    state.startEditing();
    state.draftContent.value = "新草稿";
    resolve(plan);
    await pending;
    expect(state.selectedId.value).toBe("2");
    expect(state.draftContent.value).toBe("新草稿");
    scope.stop();
  });
  it("loads on demand, ignores old detail response and handles empty/error/retry", async () => {
    const { scope, state } = setup();
    await flush();
    expect(state.items.value).toEqual([]);
    let resolve!: (value: PlanDetail) => void;
    api.getPlan.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const old = state.selectPlan("1");
    expect(state.detailLoading.value).toBe(true);
    api.getPlan.mockResolvedValueOnce({ ...plan, id: "2" });
    await state.selectPlan("2");
    resolve(plan);
    await old;
    expect(state.selectedPlan.value?.id).toBe("2");
    api.getPlan.mockRejectedValueOnce(new ServiceError("不存在", 404));
    await state.selectPlan("3");
    expect(state.selectedPlan.value).toBeNull();
    expect(state.detailError.value).toBe("不存在");
    api.getPlan.mockResolvedValueOnce({ ...plan, id: "3" });
    await state.reloadLatest();
    expect(state.selectedPlan.value?.id).toBe("3");
    scope.stop();
  });
  it("confirms dirty switching and cancel never writes", async () => {
    const { scope, state } = setup();
    await state.selectPlan("1");
    state.startEditing();
    state.draftContent.value = "草稿";
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await state.selectPlan("2");
    expect(state.selectedId.value).toBe("1");
    expect(state.draftContent.value).toBe("草稿");
    state.cancelEditing();
    expect(api.updatePlan).not.toHaveBeenCalled();
    expect(state.draftContent.value).toBe("原文");
    state.startEditing();
    state.draftContent.value = "草稿";
    api.getPlan.mockResolvedValueOnce({ ...plan, id: "2" });
    await state.selectPlan("2");
    expect(state.selectedId.value).toBe("2");
    expect(state.isEditing.value).toBe(false);
    scope.stop();
  });
  it("retains 409 draft until explicitly reloaded, and preserves draft on retry failure", async () => {
    const { scope, state } = setup();
    await state.selectPlan("1");
    state.startEditing();
    state.draftContent.value = "草稿";
    api.updatePlan.mockRejectedValueOnce(new ServiceError("冲突", 409));
    await state.saveEditing();
    expect(state.conflict.value).toBe(true);
    expect(state.draftContent.value).toBe("草稿");
    await state.saveEditing();
    expect(api.updatePlan).toHaveBeenCalledTimes(1);
    api.getPlan.mockRejectedValueOnce(new ServiceError("失败", 503));
    await state.reloadLatest();
    expect(state.draftContent.value).toBe("草稿");
    api.getPlan.mockResolvedValueOnce({
      ...plan,
      content: "新原文",
      version: 2,
    });
    await state.reloadLatest();
    expect(state.draftContent.value).toBe("新原文");
    expect(state.conflict.value).toBe(false);
    scope.stop();
  });
  it("blocks repeated save and document switching while saving, then refreshes list", async () => {
    const { scope, state } = setup();
    await state.selectPlan("1");
    state.startEditing();
    state.draftContent.value = "新正文";
    let resolve!: (value: PlanDetail) => void;
    api.updatePlan.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const write = state.saveEditing();
    await state.saveEditing();
    await state.selectPlan("2");
    state.cancelEditing();
    expect(api.updatePlan).toHaveBeenCalledOnce();
    expect(state.selectedId.value).toBe("1");
    expect(state.isEditing.value).toBe(true);
    resolve({ ...plan, content: "新正文", version: 2 });
    await write;
    expect(state.isEditing.value).toBe(false);
    expect(state.selectedPlan.value?.version).toBe(2);
    expect(api.getPlans).toHaveBeenCalledTimes(2);
    scope.stop();
  });
  it("search resets pagination but never discards active draft", async () => {
    const { scope, state } = setup();
    await state.selectPlan("1");
    state.startEditing();
    state.draftContent.value = "草稿";
    state.page.value = 2;
    await flush();
    state.keyword.value = "新的搜索";
    await flush();
    expect(state.page.value).toBe(1);
    expect(state.draftContent.value).toBe("草稿");
    expect(state.isEditing.value).toBe(true);
    scope.stop();
  });
});
