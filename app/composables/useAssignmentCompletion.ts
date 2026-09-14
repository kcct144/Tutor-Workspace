import { ref } from "vue";
import type { TaskAssignment } from "../../types/api/task-assignments";
import { completeAssignment } from "~/services/task-assignments";
import { ServiceError } from "~/services/http";
import { notifyTaskChange } from "./useTaskInvalidation";
interface AssignmentCompletionOptions {
  source?: string;
  onSaved?: (assignment: TaskAssignment) => Promise<void>;
  refreshOnFailure?: boolean;
}

export function useAssignmentCompletion(
  refresh: () => Promise<void>,
  options: AssignmentCompletionOptions = {},
) {
  const pendingIds = ref<string[]>([]),
    notice = ref("");
  async function setCompleted(
    task: Pick<TaskAssignment, "id" | "version">,
    completed: boolean,
  ) {
    if (pendingIds.value.includes(task.id)) return;
    pendingIds.value = [...pendingIds.value, task.id];
    notice.value = "";
    try {
      const saved = await completeAssignment({
        id: task.id,
        completed,
        expectedVersion: task.version,
      });
      notice.value = "任务状态已保存。";
      if (options.onSaved) await options.onSaved(saved);
      else await refresh();
      notifyTaskChange({ studentId: saved.studentId, source: options.source });
    } catch (cause) {
      notice.value =
        cause instanceof ServiceError
          ? cause.message
          : "状态未确认，请刷新核对；未自动重试。";
      if (options.refreshOnFailure !== false) await refresh();
    } finally {
      pendingIds.value = pendingIds.value.filter((id) => id !== task.id);
    }
  }
  return { pendingIds, notice, setCompleted };
}
