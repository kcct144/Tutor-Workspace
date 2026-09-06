import { onMounted, onScopeDispose } from "vue";

const eventName = "student-data-changed";
export function notifyStudentChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
}
export function useStudentInvalidation(refresh: () => Promise<void>) {
  const reload = () => {
    void refresh();
  };
  onMounted(() => {
    window.addEventListener(eventName, reload);
    window.addEventListener("focus", reload);
  });
  onScopeDispose(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener(eventName, reload);
      window.removeEventListener("focus", reload);
    }
  });
}
