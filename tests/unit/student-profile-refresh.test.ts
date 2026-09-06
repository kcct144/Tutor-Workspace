import { effectScope, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContracts } from "../../app/composables/useContracts";
import { useAssignments } from "../../app/composables/useAssignments";
import { useHome } from "../../app/composables/useHome";
import { useRemoteOptions } from "../../app/composables/useRemoteOptions";
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: (mounted: () => void) => mounted(),
}));
const api = vi.hoisted(() => ({
  getContracts: vi.fn(),
  getContract: vi.fn(),
  createContract: vi.fn(),
  updateContract: vi.fn(),
  getAssignments: vi.fn(),
  getHome: vi.fn(),
  completeAssignment: vi.fn(),
}));
vi.mock("~/services/contracts", () => api);
vi.mock("~/services/task-assignments", () => api);
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
describe("S7 student invalidation consumers", () => {
  it("refreshes contract/assignment/home and off-page selected labels without replacing drafts/IDs", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const page = { items: [], total: 0, page: 1, pageSize: 8 };
    api.getContracts.mockResolvedValue(page);
    api.getAssignments.mockResolvedValue(page);
    api.getHome.mockResolvedValue({ ...page, activeStudents: 4 });
    api.getContract.mockResolvedValue({
      id: "1",
      studentName: "旧名称",
      version: 1,
    });
    const selected = vi
      .fn()
      .mockResolvedValue([{ value: "7", label: "旧名称" }]);
    const loader = Object.assign(vi.fn().mockResolvedValue(page), { selected });
    const ids = ["7"];
    const scope = effectScope();
    const state = scope.run(() => ({
      contracts: useContracts(),
      assignments: useAssignments(),
      home: useHome(),
      options: useRemoteOptions(
        () => loader,
        () => ids,
      ),
    }))!;
    await flush();
    await state.contracts.openEdit("1");
    const draft = state.contracts.editing.value;
    state.options.keyword.value = "旧名搜索";
    await flush();
    const before = api.getContracts.mock.calls.length;
    api.getContracts.mockResolvedValue({
      ...page,
      items: [{ id: "1", studentName: "新名称" }],
    });
    selected.mockResolvedValue([{ value: "7", label: "新名称" }]);
    target.dispatchEvent(new Event("student-data-changed"));
    await flush();
    expect(api.getContracts).toHaveBeenCalledTimes(before + 1);
    expect(api.getAssignments.mock.calls.length).toBeGreaterThan(1);
    expect(api.getHome.mock.calls.length).toBeGreaterThan(1);
    expect(state.contracts.items.value[0]?.studentName).toBe("新名称");
    expect(state.contracts.editing.value).toBe(draft);
    expect(state.contracts.modalOpen.value).toBe(true);
    expect(state.options.items.value).toEqual([]);
    expect(state.options.selected.value).toEqual([
      { value: "7", label: "新名称" },
    ]);
    expect(ids).toEqual(["7"]);
    expect(state.options.keyword.value).toBe("旧名搜索");
    expect(api.updateContract).not.toHaveBeenCalled();
    scope.stop();
  });
});
