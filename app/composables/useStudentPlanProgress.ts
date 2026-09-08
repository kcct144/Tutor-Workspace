import { onScopeDispose, ref, watch } from "vue";
import type { PlanTaskProgress } from "../../types/api/study-plans";
import { getStudentPlanProgress } from "~/services/study-plans";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation } from "./useTaskInvalidation";

export function useStudentPlanProgress(studentId: () => string) {
  const items = ref<PlanTaskProgress[]>([]),
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
      const result = await getStudentPlanProgress(studentId(), request.signal);
      if (!request.signal.aborted) items.value = result;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "学习计划任务完成度加载失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(studentId, () => void refresh(), { immediate: true });
  useTaskInvalidation(refresh);
  onScopeDispose(() => controller?.abort());
  return { items, loading, error, refresh };
}
