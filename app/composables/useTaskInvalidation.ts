import { onMounted, onScopeDispose } from "vue";
const eventName = "task-data-changed";
export interface TaskChange {
  studentId?: string;
  source?: string;
}

export function notifyTaskChange(change: TaskChange = {}) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<TaskChange>(eventName, { detail: change }),
    );
}

export function useTaskInvalidation(
  refresh: () => Promise<void>,
  source?: string,
) {
  const listener = (event: Event) => {
    const change = event instanceof CustomEvent ? event.detail : undefined;
    if (!(source && change?.source === source)) void refresh();
  };
  onMounted(() => {
    window.addEventListener(eventName, listener);
    window.addEventListener("focus", listener);
  });
  onScopeDispose(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener(eventName, listener);
      window.removeEventListener("focus", listener);
    }
  });
}
