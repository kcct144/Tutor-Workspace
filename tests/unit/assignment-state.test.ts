import { effectScope, nextTick } from "vue";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useAssignments } from "../../app/composables/useAssignments";
import { useAssignmentCreate } from "../../app/composables/useAssignmentCreate";
import { useHome } from "../../app/composables/useHome";
import { ServiceError } from "../../app/services/http";
import type { TaskAssignment } from "../../types/api/task-assignments";
const api = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  completeAssignment: vi.fn(),
  createAssignments: vi.fn(),
  getHome: vi.fn(),
}));
vi.mock("~/services/task-assignments", () => api);
vi.mock("../../app/composables/useTaskInvalidation", () => ({
  useTaskInvalidation: vi.fn(),
  notifyTaskChange: vi.fn(),
}));
vi.mock("../../app/composables/useStudentInvalidation", () => ({
  useStudentInvalidation: vi.fn(),
}));
const task: TaskAssignment = {
  id: "1",
  taskId: "1",
  studentId: "1",
  studentName: "合成",
  taskTitle: "任务",
  description: "说明",
  subject: "科目",
  status: "pending",
  dueDate: "2026-09-06",
  dueState: "today",
  assignedAt: "2000-01-01T00:00:00Z",
  createdAt: "2000-01-01T00:00:00Z",
  updatedAt: "2000-01-01T00:00:00Z",
  completedAt: null,
  version: 1,
};
const page = { items: [task], total: 1, page: 1, pageSize: 8 };
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
afterEach(() => vi.resetAllMocks());
describe("S6 shared state", () => {
  it("list filters reset page; detail student stays authoritative; stale response ignored", async () => {
    let resolve!: (value: typeof page) => void;
    api.getAssignments
      .mockReturnValueOnce(new Promise((done) => (resolve = done)))
      .mockResolvedValue(page);
    const scope = effectScope(),
      state = scope.run(() => useAssignments(() => "1"))!;
    state.query.value.keyword = "新";
    await flush();
    await flush();
    resolve({ ...page, items: [] });
    await flush();
    expect(state.items.value).toHaveLength(1);
    expect(api.getAssignments.mock.lastCall![0].studentId).toBe("1");
    state.query.value.page = 2;
    await flush();
    state.query.value.status = "completed";
    await flush();
    expect(state.query.value.page).toBe(1);
    scope.stop();
  });
  it("completion disables by ID, no local mutation, failure retains confirmed state and notice", async () => {
    api.getAssignments.mockResolvedValue(page);
    const scope = effectScope(),
      state = scope.run(() => useAssignments())!;
    await flush();
    let reject!: (value: Error) => void;
    api.completeAssignment.mockReturnValue(
      new Promise((_resolve, fail) => (reject = fail)),
    );
    const promise = state.setCompleted(task, true);
    await state.setCompleted(task, true);
    expect(state.pendingIds.value).toEqual(["1"]);
    expect(state.items.value[0]!.status).toBe("pending");
    expect(api.completeAssignment).toHaveBeenCalledTimes(1);
    reject(new ServiceError("恢复冲突", 409));
    await promise;
    expect(state.notice.value).toBe("恢复冲突");
    expect(state.pendingIds.value).toEqual([]);
    expect(state.items.value[0]!.status).toBe("pending");
    scope.stop();
  });
  it("batch failure retains selections and no duplicate submission", async () => {
    const scope = effectScope(),
      state = scope.run(() => useAssignmentCreate())!;
    state.start();
    state.form.value = {
      taskId: "1",
      studentIds: ["1", "2"],
      dueDate: "2026-09-06",
    };
    let reject!: (value: Error) => void;
    api.createAssignments.mockReturnValue(
      new Promise((_resolve, fail) => (reject = fail)),
    );
    const pending = state.save();
    await state.save();
    state.close();
    expect(state.open.value).toBe(true);
    expect(api.createAssignments).toHaveBeenCalledTimes(1);
    reject(new ServiceError("整批冲突", 409));
    await pending;
    expect(state.form.value.studentIds).toEqual(["1", "2"]);
    expect(state.error.value).toBe("整批冲突");
    expect(state.notice.value).toBe("");
    scope.stop();
  });
  it("list empty and offline states distinct", async () => {
    api.getAssignments.mockResolvedValue({ ...page, items: [], total: 0 });
    const scope = effectScope(),
      state = scope.run(() => useAssignments())!;
    await flush();
    expect(state.total.value).toBe(0);
    expect(state.error.value).toBe("");
    api.getAssignments.mockRejectedValue(new Error());
    await state.refresh();
    expect(state.error.value).toBeTruthy();
    expect(state.items.value).toEqual([]);
    scope.stop();
  });
  it("home uses server counts, updates summary after completion and resets grade page", async () => {
    const card = {
      id: "1",
      name: "合成",
      grade: "初一",
      school: null,
      status: "在读",
      subjects: [],
      expiryDate: null,
      expiresInDays: null,
      plans: [],
      pendingTasks: [task],
      completedTasks: [],
      pendingCount: 8,
      completedCount: 4,
      pendingRemaining: 7,
      completedRemaining: 4,
    };
    api.getHome.mockResolvedValue({
      items: [card],
      total: 1,
      activeStudents: 4,
      page: 1,
      pageSize: 20,
    });
    const scope = effectScope(),
      state = scope.run(() => useHome())!;
    await flush();
    expect(state.items.value[0]!.pendingCount).toBe(8);
    expect(state.activeStudents.value).toBe(4);
    api.completeAssignment.mockResolvedValue({ ...task, status: "completed" });
    api.getHome.mockResolvedValue({
      items: [{ ...card, pendingCount: 7, completedCount: 5 }],
      total: 1,
      activeStudents: 4,
      page: 1,
      pageSize: 20,
    });
    await state.setCompleted(task, true);
    expect(state.items.value[0]!.completedCount).toBe(5);
    state.query.value.page = 2;
    await flush();
    state.query.value.grade = "初二";
    await flush();
    expect(state.query.value.page).toBe(1);
    scope.stop();
  });
});
