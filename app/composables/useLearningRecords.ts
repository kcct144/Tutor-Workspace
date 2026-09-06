import { ref, reactive, watch, onScopeDispose } from "vue";
import type {
  LearningRecord,
  RecordCategory,
  RecordFields,
} from "../../types/api/learning-records";
import {
  getRecords,
  createRecord,
  updateRecord,
  reloadRecord,
} from "~/services/learning-records";
import { ServiceError } from "~/services/http";
import { notifyStudentChange } from "./useStudentInvalidation";

export function useLearningRecords(studentId: () => string) {
  const items = ref<LearningRecord[]>([]),
    total = ref(0),
    page = ref(1),
    pageSize = 5;
  const keyword = ref(""),
    category = ref<RecordCategory | undefined>();
  const dates = ref<[string, string] | undefined>();
  const loading = ref(false),
    error = ref(""),
    success = ref("");
  const open = ref(false),
    saving = ref(false),
    editError = ref(""),
    conflict = ref(false),
    reloading = ref(false);
  const editing = ref<LearningRecord | null>(null);
  const draft = reactive<RecordFields>({
    category: "缺",
    content: "",
    occurredOn: "",
  });
  let controller: AbortController | undefined,
    editController: AbortController | undefined;
  let generation = 0;
  const message = (cause: unknown, fallback: string) =>
    cause instanceof ServiceError ? cause.message : fallback;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    total.value = 0;
    try {
      const result = await getRecords(
        {
          studentId: studentId(),
          page: page.value,
          pageSize,
          keyword: keyword.value.trim() || undefined,
          category: category.value,
          dateFrom: dates.value?.[0],
          dateTo: dates.value?.[1],
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      items.value = result.items;
      total.value = result.total;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value = message(cause, "无法加载学习记录，请重试。");
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  function resetFilters() {
    keyword.value = "";
    category.value = undefined;
    dates.value = undefined;
  }
  watch([keyword, category, dates], () => {
    if (page.value !== 1) page.value = 1;
    else void refresh();
  });
  watch(page, () => void refresh());
  watch(
    studentId,
    () => {
      generation++;
      editController?.abort();
      open.value = false;
      editing.value = null;
      saving.value = false;
      success.value = "";
      resetFilters();
      page.value = 1;
      void refresh();
    },
    { immediate: true },
  );
  function begin(record?: LearningRecord) {
    if (saving.value || (record && record.studentId !== studentId())) return;
    editController?.abort();
    editing.value = record ? { ...record } : null;
    Object.assign(
      draft,
      record
        ? {
            category: record.category,
            content: record.content,
            occurredOn: record.occurredOn,
          }
        : { category: "缺", content: "", occurredOn: "" },
    );
    editError.value = "";
    conflict.value = false;
    open.value = true;
  }
  function close() {
    if (!saving.value && !reloading.value) open.value = false;
  }
  async function save() {
    if (saving.value || reloading.value || conflict.value || !open.value)
      return;
    const context = generation,
      owner = studentId(),
      record = editing.value;
    if (
      !draft.occurredOn ||
      !draft.content.trim() ||
      [...draft.content.trim()].length > 10000
    ) {
      editError.value = "请填写发生日期及1–10000字正文。";
      return;
    }
    saving.value = true;
    editError.value = "";
    success.value = "";
    try {
      const fields = {
        category: draft.category,
        content: draft.content,
        occurredOn: draft.occurredOn,
      };
      if (record)
        await updateRecord({
          ...fields,
          id: record.id,
          expectedVersion: record.version,
        });
      else await createRecord({ ...fields, studentId: owner });
      notifyStudentChange();
      if (context !== generation) return;
      open.value = false;
      success.value = record ? "学习记录已更新。" : "学习记录已新增。";
      if (page.value !== 1) page.value = 1;
      else await refresh();
    } catch (cause) {
      if (context === generation) {
        conflict.value =
          cause instanceof ServiceError && cause.statusCode === 409;
        editError.value = message(
          cause,
          "保存结果不明，请先刷新列表核对；草稿已保留，请勿直接重复新增。",
        );
      }
    } finally {
      if (context === generation) saving.value = false;
    }
  }
  async function reloadEditing() {
    if (!editing.value || saving.value || reloading.value) return;
    editController?.abort();
    const request = new AbortController();
    editController = request;
    reloading.value = true;
    try {
      const record = await reloadRecord(
        studentId(),
        editing.value.id,
        request.signal,
      );
      if (request.signal.aborted) return;
      editing.value = record;
      Object.assign(draft, {
        category: record.category,
        content: record.content,
        occurredOn: record.occurredOn,
      });
      conflict.value = false;
      editError.value = "";
    } catch (cause) {
      if (!request.signal.aborted)
        editError.value = message(cause, "重载失败，草稿已保留。");
    } finally {
      if (!request.signal.aborted) reloading.value = false;
    }
  }
  onScopeDispose(() => {
    generation++;
    controller?.abort();
    editController?.abort();
  });
  return {
    items,
    total,
    page,
    pageSize,
    keyword,
    category,
    dates,
    loading,
    error,
    success,
    open,
    saving,
    editError,
    conflict,
    reloading,
    editing,
    draft,
    refresh,
    resetFilters,
    begin,
    close,
    save,
    reloadEditing,
  };
}
