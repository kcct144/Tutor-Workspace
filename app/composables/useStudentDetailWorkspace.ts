import { reactive, ref, watch } from "vue";

export type StudentDetailTab = "records" | "scores" | "assignments";

export function useStudentDetailWorkspace(studentId: () => string) {
  const activeTab = ref<StudentDetailTab>("records");
  const visited = reactive<Record<StudentDetailTab, boolean>>({
    records: true,
    scores: false,
    assignments: false,
  });

  watch(activeTab, (tab) => {
    visited[tab] = true;
  });
  watch(studentId, () => {
    activeTab.value = "records";
    visited.records = true;
    visited.scores = false;
    visited.assignments = false;
  });

  return { activeTab, visited };
}
