import { onMounted, onScopeDispose } from "vue";
const eventName = "task-data-changed";
export function notifyTaskChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
}
export function useTaskInvalidation(refresh: () => Promise<void>) {
  const listener = () => void refresh();
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
