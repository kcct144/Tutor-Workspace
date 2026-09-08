import { ref, watch, onScopeDispose } from "vue";
import { createAssignments } from "~/services/task-assignments";
import { getTask } from "~/services/tasks";
import { ServiceError } from "~/services/http";
import { notifyTaskChange } from "./useTaskInvalidation";
export function useAssignmentCreate() {
  const open = ref(false),
    saving = ref(false),
    error = ref(""),
    notice = ref("");
  const selectedPlanName = ref<string | null>(null),
    taskLookupError = ref("");
  let taskController: AbortController | undefined;
  const form = ref<{
    taskId: string | undefined;
    studentIds: string[];
    dueDate: string;
  }>({ taskId: undefined, studentIds: [], dueDate: "" });
  function start() {
    if (saving.value) return;
    form.value = { taskId: undefined, studentIds: [], dueDate: "" };
    error.value = "";
    selectedPlanName.value = null;
    taskLookupError.value = "";
    open.value = true;
  }
  watch(
    () => form.value.taskId,
    async (id) => {
      taskController?.abort();
      selectedPlanName.value = null;
      taskLookupError.value = "";
      if (!id) return;
      const request = new AbortController();
      taskController = request;
      try {
        const task = await getTask(id, request.signal);
        if (!request.signal.aborted)
          selectedPlanName.value = task.studyPlan?.title ?? null;
      } catch (cause) {
        if (!request.signal.aborted)
          taskLookupError.value =
            cause instanceof ServiceError
              ? cause.message
              : "无法读取任务计划关联，请重新选择任务。";
      }
    },
  );
  function close() {
    if (!saving.value) open.value = false;
  }
  async function save() {
    if (saving.value) return;
    error.value = "";
    notice.value = "";
    if (
      !form.value.taskId ||
      !form.value.dueDate ||
      form.value.studentIds.length < 1 ||
      form.value.studentIds.length > 100
    ) {
      error.value = "请选择一个任务、1–100名学生及截止日期。";
      return;
    }
    saving.value = true;
    try {
      const result = await createAssignments({
        taskId: form.value.taskId,
        studentIds: [...form.value.studentIds],
        dueDate: form.value.dueDate,
      });
      open.value = false;
      notice.value = "已创建" + result.createdCount + "条任务分配。";
      notifyTaskChange();
    } catch (cause) {
      error.value =
        cause instanceof ServiceError
          ? cause.message
          : "创建结果未确认；选择保留，请先刷新核对，不要直接重复创建。";
    } finally {
      saving.value = false;
    }
  }
  onScopeDispose(() => taskController?.abort());
  return {
    open,
    saving,
    error,
    notice,
    form,
    selectedPlanName,
    taskLookupError,
    start,
    close,
    save,
  };
}
