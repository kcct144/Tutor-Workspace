import { ref } from "vue";
import { getStudent, updateStudentStatus } from "~/services/students";
import { ServiceError } from "~/services/http";
import { notifyStudentChange } from "./useStudentInvalidation";
import type { StudentDetail, StudentStatus } from "../../types/api/students";
export function useStudentStatus() {
  const open = ref(false),
    saving = ref(false),
    loading = ref(false),
    error = ref(""),
    info = ref(""),
    blocked = ref(false),
    source = ref<StudentDetail | null>(null),
    target = ref<StudentStatus>("待分配"),
    notice = ref("");
  function begin(student: StudentDetail) {
    source.value = student;
    target.value = student.status;
    error.value = "";
    info.value = "";
    notice.value = "";
    blocked.value = false;
    open.value = true;
  }
  async function reload() {
    if (!source.value || saving.value || loading.value) return;
    loading.value = true;
    try {
      source.value = await getStudent(source.value.id);
      blocked.value = false;
      error.value = "";
      info.value = "已读取最新状态，请核对目标后重新确认。";
    } catch {
      info.value = "";
      error.value = "状态读取失败，请重试。";
    } finally {
      loading.value = false;
    }
  }
  async function save() {
    if (!source.value || saving.value || loading.value || blocked.value) return;
    saving.value = true;
    info.value = "";
    try {
      await updateStudentStatus({
        id: source.value.id,
        status: target.value,
        expectedVersion: source.value.version,
      });
      open.value = false;
      notifyStudentChange();
      notice.value = "学生状态已保存，关联数据保持不变。";
    } catch (cause) {
      blocked.value = true;
      error.value =
        cause instanceof ServiceError
          ? cause.message
          : "保存结果不明，请先重新读取状态核对，不自动重发。";
    } finally {
      saving.value = false;
    }
  }
  return {
    open,
    saving,
    loading,
    error,
    info,
    blocked,
    source,
    target,
    notice,
    begin,
    reload,
    save,
  };
}
