import { ref } from "vue";
import type { TaskAssignment } from "../../types/api/task-assignments";
import { completeAssignment } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";
import { notifyTaskChange } from "./useTaskInvalidation";
export function useAssignmentCompletion(refresh: () => Promise<void>) {
  const pendingIds = ref<string[]>([]),
    notice = ref("");
  async function setCompleted(task: TaskAssignment, completed: boolean) {
    if (pendingIds.value.includes(task.id)) return;
    pendingIds.value = [...pendingIds.value, task.id];
    notice.value = "";
    try {
      await completeAssignment({
        id: task.id,
        completed,
        expectedVersion: task.version,
      });
      notice.value = "任务状态已保存。";
      await refresh();
      notifyTaskChange();
    } catch (cause) {
      notice.value =
        cause instanceof ServiceError
          ? cause.message
          : "状态未确认，请刷新核对；未自动重试。";
      await refresh();
    } finally {
      pendingIds.value = pendingIds.value.filter((id) => id !== task.id);
    }
  }
  return { pendingIds, notice, setCompleted };
}
