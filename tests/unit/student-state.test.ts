import { effectScope, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  StudentDetail,
  StudentListItem,
  Page,
} from "../../types/api/students";
import { ServiceError } from "../../app/services/http";
import {
  useStudentDetail,
  useStudents,
} from "../../app/composables/useStudents";

const api = vi.hoisted(() => ({ getStudents: vi.fn(), getStudent: vi.fn() }));
vi.mock("~/services/students", () => api);
afterEach(() => vi.resetAllMocks());
const empty = { items: [], total: 0, page: 1, pageSize: 8 };
async function flush() {
  await Promise.resolve();
  await nextTick();
}

describe("student async state", () => {
  it("exposes loading, empty, failure and retry without mock fallback", async () => {
    let resolve!: (value: Page<StudentListItem>) => void;
    api.getStudents.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const scope = effectScope();
    const state = scope.run(useStudents)!;
    expect(state.loading.value).toBe(true);
    resolve(empty);
    await flush();
    expect(state.loading.value).toBe(false);
    expect(state.items.value).toEqual([]);
    api.getStudents.mockRejectedValueOnce(
      new ServiceError("服务暂不可用", 503),
    );
    await state.refresh();
    expect(state.error.value).toBe("服务暂不可用");
    expect(state.items.value).toEqual([]);
    api.getStudents.mockResolvedValueOnce(empty);
    await state.refresh();
    expect(state.error.value).toBe("");
    scope.stop();
  });
  it("resets page when filters change and ignores a stale response", async () => {
    api.getStudents.mockResolvedValue(empty);
    const scope = effectScope();
    const state = scope.run(useStudents)!;
    await flush();
    state.changePage({ current: 2 });
    await flush();
    expect(api.getStudents.mock.lastCall?.[0].page).toBe(2);
    let resolve!: (value: Page<StudentListItem>) => void;
    api.getStudents.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    state.keyword.value = "早期搜索";
    await flush();
    expect(state.page.value).toBe(1);
    const oldSignal = api.getStudents.mock.lastCall?.[1] as AbortSignal;
    state.keyword.value = "新搜索";
    await flush();
    resolve({ ...empty, total: 99 });
    await flush();
    expect(oldSignal.aborted).toBe(true);
    expect(state.total.value).toBe(0);
    scope.stop();
  });
  it("distinguishes detail loading from 404 and re-reads a changed route", async () => {
    api.getStudent.mockRejectedValueOnce(new ServiceError("未找到学生。", 404));
    const id = ref("999");
    const scope = effectScope();
    const state = scope.run(() => useStudentDetail(() => id.value))!;
    expect(state.loading.value).toBe(true);
    expect(state.notFound.value).toBe(false);
    await flush();
    expect(state.notFound.value).toBe(true);
    api.getStudent.mockResolvedValueOnce({
      id: "1",
      owner: null,
      gender: null,
    } as StudentDetail);
    id.value = "1";
    await flush();
    expect(state.notFound.value).toBe(false);
    expect(state.student.value?.id).toBe("1");
    scope.stop();
  });
});
