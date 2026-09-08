import { effectScope, nextTick } from "vue";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useTasks } from "../../app/composables/useTasks";
import { ServiceError } from "../../app/services/http";
import type { TaskDefinition } from "../../types/api/tasks";
const api = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskStatus: vi.fn(),
  loadTaskSubjects: vi.fn(),
  loadTaskPlans: vi.fn(),
}));
vi.mock("~/services/tasks", () => api);
vi.mock("./../../app/composables/useTaskInvalidation", () => ({
  useTaskInvalidation: vi.fn(),
  notifyTaskChange: vi.fn(),
}));
const task: TaskDefinition = {
  id: "1",
  title: "任务",
  subject: "科目",
  description: "说明",
  status: "enabled",
  version: 1,
  assignmentCount: 0,
  createdAt: "2000-01-01T00:00:00Z",
  updatedAt: "2000-01-01T00:00:00Z",
  studyPlan: null,
};
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
function setup() {
  api.getTasks.mockResolvedValue({
    items: [task],
    total: 1,
    page: 1,
    pageSize: 8,
  });
  api.getTask.mockResolvedValue(task);
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
  const scope = effectScope();
  return { scope, state: scope.run(() => useTasks())! };
}
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
describe("S5 task UI state", () => {
  it("detail race and close cannot refill wrong editor", async () => {
    const { scope, state } = setup();
    let resolve!: (t: TaskDefinition) => void;
    api.getTask.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const old = state.openEdit("1");
    api.getTask.mockResolvedValueOnce({ ...task, id: "2", title: "新任务" });
    await state.openEdit("2");
    resolve(task);
    await old;
    expect(state.form.value.title).toBe("新任务");
    scope.stop();
  });
  it("conflict/error keeps draft; list refresh does not erase it; explicit reload", async () => {
    const { scope, state } = setup();
    await state.openEdit("1");
    state.form.value.description = "草稿";
    api.updateTask.mockRejectedValue(new ServiceError("版本冲突", 409));
    await state.save();
    expect(state.conflict.value).toBe(true);
    expect(state.form.value.description).toBe("草稿");
    await state.refresh();
    expect(state.form.value.description).toBe("草稿");
    await state.save();
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    vi.mocked(window.confirm).mockReturnValue(false);
    await state.reloadDetail();
    expect(state.form.value.description).toBe("草稿");
    vi.mocked(window.confirm).mockReturnValue(true);
    await state.reloadDetail();
    expect(state.form.value.description).toBe("说明");
    scope.stop();
  });
  it("no false success for 503, no duplicate submit, create excludes status/owner", async () => {
    const { scope, state } = setup();
    state.openCreate();
    Object.assign(state.form.value, {
      title: "t",
      subject: "s",
      description: "d",
    });
    let reject!: (e: Error) => void;
    api.createTask.mockReturnValue(
      new Promise((_done, fail) => (reject = fail)),
    );
    const pending = state.save();
    await state.save();
    state.close();
    expect(state.modalOpen.value).toBe(true);
    expect(api.createTask).toHaveBeenCalledTimes(1);
    expect(api.createTask.mock.calls[0]![0]).toEqual({
      title: "t",
      subject: "s",
      description: "d",
      studyPlanId: null,
    });
    reject(new ServiceError("操作人无效", 503));
    await pending;
    expect(state.notice.value).toBe("");
    expect(state.form.value.description).toBe("d");
    scope.stop();
  });
  it("target status, per-row pending, conflict refresh and persistent notice", async () => {
    const { scope, state } = setup();
    await flush();
    let reject!: (e: Error) => void;
    api.setTaskStatus.mockReturnValue(
      new Promise((_done, fail) => (reject = fail)),
    );
    const pending = state.changeStatus("1");
    await state.changeStatus("1");
    expect(api.setTaskStatus).toHaveBeenCalledTimes(1);
    expect(api.setTaskStatus.mock.calls[0]![0]).toEqual({
      id: "1",
      status: "disabled",
      expectedVersion: 1,
    });
    reject(new ServiceError("版本冲突", 409));
    await pending;
    expect(state.notice.value).toBe("版本冲突");
    expect(state.pendingIds.value).toEqual([]);
    scope.stop();
  });
  it("loading/empty/error and filter resets server page", async () => {
    const { scope, state } = setup();
    await flush();
    state.query.value.page = 2;
    await flush();
    state.query.value.keyword = "查";
    await flush();
    await flush();
    expect(state.query.value.page).toBe(1);
    api.getTasks.mockRejectedValue(new Error("offline"));
    await state.refresh();
    expect(state.error.value).toBeTruthy();
    expect(state.items.value).toEqual([]);
    api.getTasks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 8,
    });
    await state.refresh();
    expect(state.error.value).toBe("");
    expect(state.total.value).toBe(0);
    scope.stop();
  });
});
