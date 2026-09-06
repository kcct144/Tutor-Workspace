import { ref, watch, onScopeDispose } from "vue";
import type { HomeQuery, HomeStudent } from "../../types/api/home";
import { getHome } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation } from "./useTaskInvalidation";
import { useStudentInvalidation } from "./useStudentInvalidation";
import { useAssignmentCompletion } from "./useAssignmentCompletion";
export function useHome() {
  const query = ref<HomeQuery>({ page: 1, pageSize: 20 }),
    items = ref<HomeStudent[]>([]),
    total = ref(0),
    activeStudents = ref(0),
    loading = ref(false),
    error = ref(""),
    message = ref("");
  let controller: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    try {
      const page = await getHome(query.value, request.signal);
      if (!request.signal.aborted) {
        items.value = page.items;
        total.value = page.total;
        activeStudents.value = page.activeStudents;
      }
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "首页加载失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    () => query.value.grade,
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
  const completion = useAssignmentCompletion(refresh);
  function change(id: string, checked: boolean) {
    const task = items.value
      .flatMap((item) => [...item.pendingTasks, ...item.completedTasks])
      .find((item) => item.id === id);
    if (task) void completion.setCompleted(task, checked);
  }
  function showMessage(text: string) {
    message.value = text;
    clearTimeout(timer);
    timer = setTimeout(() => (message.value = ""), 2200);
  }
  useTaskInvalidation(refresh);
  useStudentInvalidation(refresh);
  onScopeDispose(() => {
    controller?.abort();
    clearTimeout(timer);
  });
  return {
    query,
    items,
    total,
    activeStudents,
    loading,
    error,
    refresh,
    change,
    showMessage,
    message,
    ...completion,
  };
}
