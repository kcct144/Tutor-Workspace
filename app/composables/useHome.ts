import { computed, ref, watch, onScopeDispose } from "vue";
import type { HomeQuery, HomeStudent } from "../../types/api/home";
import { getHome } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation } from "./useTaskInvalidation";
import { useStudentInvalidation } from "./useStudentInvalidation";
import { useAssignmentCompletion } from "./useAssignmentCompletion";

export function useHome() {
  const auth = useAuth();
  const query = ref<HomeQuery>({
      page: 1,
      pageSize: 20,
      subjectMode: "responsible",
    }),
    items = ref<HomeStudent[]>([]),
    total = ref(0),
    activeStudents = ref(0),
    loading = ref(false),
    error = ref(""),
    message = ref(""),
    subjectConfigurationRequired = ref(false);
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
        subjectConfigurationRequired.value = page.subjectConfigurationRequired;
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
    () => [
      query.value.grade,
      query.value.tag,
      query.value.subjectMode,
      JSON.stringify(query.value.subject ?? []),
    ],
    () => {
      if (query.value.page !== 1) query.value.page = 1;
      else void refresh();
    },
  );
  watch(
    () => auth.user.value?.version,
    () => {
      if (query.value.subjectMode === "responsible") {
        if (query.value.page !== 1) query.value.page = 1;
        else void refresh();
      }
    },
  );
  watch(
    () => query.value.page,
    () => void refresh(),
    { immediate: true },
  );
  const completion = useAssignmentCompletion(refresh, {
    source: "home",
    refreshOnFailure: false,
  });
  function change(id: string, checked: boolean) {
    const task = items.value
      .flatMap((item) => item.pendingTasks)
      .find((item) => item.id === id);
    if (task) void completion.setCompleted(task, checked);
  }
  function showMessage(text: string) {
    message.value = text;
    clearTimeout(timer);
    timer = setTimeout(() => (message.value = ""), 2200);
  }
  function useResponsibleSubjects() {
    query.value = {
      ...query.value,
      page: 1,
      subjectMode: "responsible",
      subject: undefined,
    };
  }
  function useAllSubjects() {
    query.value = {
      ...query.value,
      page: 1,
      subjectMode: "all",
      subject: undefined,
    };
  }
  useTaskInvalidation(refresh, "home");
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
    subjectConfigurationRequired,
    loading,
    error,
    refresh,
    change,
    showMessage,
    message,
    useResponsibleSubjects,
    useAllSubjects,
    settingsOpen: auth.settingsOpen,
    responsibleSubjects: computed(
      () => auth.user.value?.responsibleSubjects ?? [],
    ),
    ...completion,
  };
}
