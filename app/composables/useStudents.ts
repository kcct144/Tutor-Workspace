import { computed, onScopeDispose, ref, watch } from "vue";
import { getStudents, getStudent } from "~/services/students";
import { ServiceError } from "~/services/http";
import type {
  StudentDetail,
  StudentListItem,
  StudentGrade,
  StudentStatus,
} from "../../types/api/students";

export function useStudents() {
  const items = ref<StudentListItem[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = 8;
  const keyword = ref("");
  const grade = ref<StudentGrade | "全部">("全部");
  const status = ref<StudentStatus | "全部">("全部");
  const loading = ref(false);
  const error = ref("");
  let controller: AbortController | undefined;

  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    total.value = 0;
    try {
      const result = await getStudents(
        {
          page: page.value,
          pageSize,
          keyword: keyword.value.trim() || undefined,
          grade: grade.value === "全部" ? undefined : grade.value,
          status: status.value === "全部" ? undefined : status.value,
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      items.value = result.items;
      total.value = result.total;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "无法加载学生，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch([keyword, grade, status], () => {
    if (page.value !== 1) page.value = 1;
    else void refresh();
  });
  watch(
    page,
    () => {
      void refresh();
    },
    { immediate: true },
  );
  onScopeDispose(() => controller?.abort());
  function reset() {
    keyword.value = "";
    grade.value = "全部";
    status.value = "全部";
  }
  function changePage(pagination: { current?: number }) {
    page.value = pagination.current ?? 1;
  }
  return {
    items,
    total,
    page,
    pageSize,
    keyword,
    grade,
    status,
    loading,
    error,
    refresh,
    reset,
    changePage,
  };
}

export function useStudentDetail(id: () => string) {
  const student = ref<StudentDetail | null>(null);
  const loading = ref(false);
  const error = ref("");
  const statusCode = ref(0);
  const notFound = computed(() => statusCode.value === 404);
  let controller: AbortController | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    statusCode.value = 0;
    student.value = null;
    try {
      const result = await getStudent(id(), request.signal);
      if (!request.signal.aborted) student.value = result;
    } catch (cause) {
      if (!request.signal.aborted) {
        statusCode.value = cause instanceof ServiceError ? cause.statusCode : 0;
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "无法加载学生详情，请重试。";
      }
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    id,
    () => {
      void refresh();
    },
    { immediate: true },
  );
  onScopeDispose(() => controller?.abort());
  return { student, loading, error, notFound, refresh };
}
