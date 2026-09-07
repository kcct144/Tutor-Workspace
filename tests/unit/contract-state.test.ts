import { effectScope, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContracts } from "../../app/composables/useContracts";
import { ServiceError } from "../../app/services/http";
import type { Contract, ContractWrite } from "../../types/api/contracts";

const api = vi.hoisted(() => ({
  getContracts: vi.fn(),
  getContract: vi.fn(),
  createContract: vi.fn(),
  updateContract: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("~/services/contracts", () => api);
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  notifyStudentChange: api.notify,
  useStudentInvalidation: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const base: ContractWrite = {
  studentId: "1",
  subject: "合成科目",
  contractType: "lessons",
  startDate: null,
  endDate: null,
  attendedLessons: 0,
  totalLessons: 1,
  makeupLessons: 0,
};
const contract: Contract = {
  ...base,
  id: "1",
  contractNo: "read-only",
  trialStatus: null,
  studentName: "合成学生",
  status: "生效中",
  version: 1,
  updatedAt: "2026-09-06T00:00:00Z",
};
const page = { items: [contract], total: 1, page: 1, pageSize: 8 };
describe("contract UI orchestration", () => {
  it("deduplicates submissions and refreshes both contracts and student consumers", async () => {
    api.getContracts.mockResolvedValue(page);
    let resolve!: (value: Contract) => void;
    api.createContract.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const scope = effectScope();
    const state = scope.run(useContracts)!;
    state.openCreate();
    const save = state.save(base);
    await state.save(base);
    expect(api.createContract).toHaveBeenCalledOnce();
    expect(state.saving.value).toBe(true);
    resolve(contract);
    await save;
    expect(state.modalOpen.value).toBe(false);
    expect(api.notify).toHaveBeenCalledOnce();
    expect(api.getContracts).toHaveBeenCalledTimes(2);
    scope.stop();
  });
  it("keeps edit context and blocks old-version retries until explicit reload", async () => {
    api.getContracts.mockResolvedValue(page);
    api.getContract.mockResolvedValue(contract);
    api.updateContract.mockRejectedValueOnce(new ServiceError("版本冲突", 409));
    const scope = effectScope();
    const state = scope.run(useContracts)!;
    await state.openEdit("1");
    await state.save(base);
    expect(state.modalOpen.value).toBe(true);
    expect(state.conflict.value).toBe(true);
    expect(state.editing.value?.version).toBe(1);
    expect(api.notify).not.toHaveBeenCalled();
    await state.save(base);
    expect(api.updateContract).toHaveBeenCalledOnce();
    api.getContract.mockResolvedValueOnce({ ...contract, version: 2 });
    await state.reloadDetail();
    expect(state.conflict.value).toBe(false);
    expect(state.editing.value?.version).toBe(2);
    scope.stop();
  });
  it("shows load/save errors and resets page on filter changes without fake data", async () => {
    api.getContracts.mockResolvedValue(page);
    api.getContract.mockRejectedValue(new Error("network"));
    const scope = effectScope();
    const state = scope.run(useContracts)!;
    await state.openEdit("1");
    expect(state.detailFailed.value).toBe(true);
    await state.save(base);
    expect(api.updateContract).not.toHaveBeenCalled();
    state.openCreate();
    api.createContract.mockRejectedValue(new Error("network"));
    await state.save(base);
    expect(state.formError.value).toContain("保存结果未确认");
    expect(state.modalOpen.value).toBe(true);
    state.query.value.page = 2;
    await nextTick();
    state.query.value.keyword = "合成";
    await nextTick();
    expect(state.query.value.page).toBe(1);
    scope.stop();
  });
});
