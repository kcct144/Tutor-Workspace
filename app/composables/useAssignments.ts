import { ref, watch, onScopeDispose } from "vue";
import type {
  AssignmentQuery,
  TaskAssignment,
} from "../../types/api/task-assignments";
import { getAssignments } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation } from "./useTaskInvalidation";
import { useStudentInvalidation } from "./useStudentInvalidation";
import { useAssignmentCompletion } from "./useAssignmentCompletion";
export function useAssignments(
  studentId: () => string | undefined = () => undefined,
) {
  const query = ref<AssignmentQuery>({
      page: 1,
      pageSize: studentId() ? 5 : 8,
    }),
    items = ref<TaskAssignment[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref("");
  let controller: AbortController | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    try {
      const page = await getAssignments(
        { ...query.value, studentId: studentId() },
        request.signal,
      );
      if (!request.signal.aborted) {
        items.value = page.items;
        total.value = page.total;
      }
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "任务分配加载失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    () => [
      studentId(),
      query.value.keyword,
      query.value.subject,
      query.value.status,
      query.value.dueState,
    ],
    () => {
      if (query.value.page !== 1) query.value.page = 1;
      else void refresh();
    },
  );
  watch(
    () => query.value.page,
    () => void refresh(),
    { immediate: true },
  );
  function reset() {
    query.value = { page: 1, pageSize: studentId() ? 5 : 8 };
  }
  const completion = useAssignmentCompletion(refresh, {
    source: "assignments",
  });
  function change(id: string, checked: boolean) {
    const task = items.value.find((item) => item.id === id);
    if (task) void completion.setCompleted(task, checked);
  }
  useTaskInvalidation(refresh, "assignments");
  useStudentInvalidation(refresh);
  onScopeDispose(() => controller?.abort());
  return {
    query,
    items,
    total,
    loading,
    error,
    refresh,
    reset,
    change,
    ...completion,
  };
}
