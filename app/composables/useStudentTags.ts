import { ref, watch, onScopeDispose } from "vue";
import { normalizeStudentTags } from "../../types/api/student-tags";
import { getStudentTags, saveStudentTags } from "~/services/student-tags";
import { ServiceError } from "~/services/http";
import {
  notifyStudentChange,
  useStudentInvalidation,
} from "./useStudentInvalidation";

export function useStudentTags(id: () => string) {
  const tags = ref<string[]>([]),
    draft = ref<string[]>([]),
    version = ref(0);
  const editing = ref(false),
    loading = ref(false),
    saving = ref(false),
    error = ref(""),
    notice = ref("");
  let controller: AbortController | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    version.value = 0;
    error.value = "";
    try {
      const result = await getStudentTags(id(), request.signal);
      if (request.signal.aborted) return;
      tags.value = result.tags;
      version.value = result.version;
      draft.value = [...result.tags];
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "标签加载失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  async function begin() {
    editing.value = true;
    notice.value = "";
    await refresh();
  }
  function cancel() {
    if (!saving.value) {
      editing.value = false;
      draft.value = [...tags.value];
      error.value = "";
    }
  }
  async function save() {
    if (saving.value || loading.value || !version.value) return;
    error.value = "";
    notice.value = "";
    let normalized: string[];
    try {
      normalized = normalizeStudentTags(draft.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "标签无效。";
      return;
    }
    saving.value = true;
    const studentId = id();
    try {
      const result = await saveStudentTags({
        id: studentId,
        tags: normalized,
        expectedVersion: version.value,
      });
      if (id() !== studentId) return;
      tags.value = result.tags;
      draft.value = [...result.tags];
      version.value = result.version;
      editing.value = false;
      notice.value = "学生标签已保存。";
      notifyStudentChange();
    } catch (cause) {
      if (id() === studentId)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "保存结果未确认，请重新加载核对；未自动重试。";
    } finally {
      saving.value = false;
    }
  }
  watch(
    id,
    () => {
      editing.value = false;
      version.value = 0;
      tags.value = [];
      draft.value = [];
      void refresh();
    },
    { immediate: true },
  );
  useStudentInvalidation(async () => {
    if (!editing.value && !saving.value) await refresh();
  });
  onScopeDispose(() => controller?.abort());
  return {
    tags,
    draft,
    editing,
    loading,
    saving,
    error,
    notice,
    begin,
    cancel,
    save,
    refresh,
  };
}
