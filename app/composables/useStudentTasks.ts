import { computed, onScopeDispose, ref, watch } from "vue";
import type { TaskAssignment } from "../../types/api/task-assignments";
import { getAssignments } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";

/** Bounded page for one student's complete task list shown in the card popover. */
export const studentTaskPageSize = 100;

export function useStudentTasks(studentId: () => string) {
  const tasks = ref<TaskAssignment[]>([]),
    loading = ref(false),
    error = ref("");
  let controller: AbortController | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    try {
      const page = await getAssignments(
        { studentId: studentId(), page: 1, pageSize: studentTaskPageSize },
        request.signal,
      );
      if (request.signal.aborted) return;
      tasks.value = page.items;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "任务加载失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(studentId, () => void refresh());
  onScopeDispose(() => controller?.abort());
  return {
    tasks,
    pending: computed(() =>
      tasks.value.filter((task) => task.status === "pending"),
    ),
    completed: computed(() =>
      tasks.value.filter((task) => task.status === "completed"),
    ),
    loading,
    error,
    refresh,
  };
}
