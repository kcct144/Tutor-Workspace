import { ref, watch, onScopeDispose } from "vue";
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  setTaskStatus,
  loadTaskSubjects,
} from "~/services/tasks";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation, notifyTaskChange } from "./useTaskInvalidation";
import type {
  TaskDefinition,
  TaskQuery,
  TaskWrite,
  TaskStatus,
} from "../../types/api/tasks";
const emptyForm = (): TaskWrite & { status: TaskStatus } => ({
  title: "",
  subject: "",
  description: "",
  status: "enabled",
});
const message = (cause: unknown, fallback: string) =>
  cause instanceof ServiceError ? cause.message : fallback;
export function useTasks() {
  const query = ref<TaskQuery>({ page: 1, pageSize: 8 }),
    items = ref<TaskDefinition[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref(""),
    notice = ref("");
  const modalOpen = ref(false),
    editing = ref<TaskDefinition | null>(null),
    editingId = ref<string>(),
    form = ref(emptyForm()),
    formError = ref(""),
    detailLoading = ref(false),
    detailFailed = ref(false),
    saving = ref(false),
    conflict = ref(false),
    pendingIds = ref<string[]>([]);
  let listController: AbortController | undefined,
    detailController: AbortController | undefined;
  async function refresh() {
    listController?.abort();
    const request = new AbortController();
    listController = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    try {
      const result = await getTasks(query.value, request.signal);
      if (!request.signal.aborted) {
        items.value = result.items;
        total.value = result.total;
      }
    } catch (cause) {
      if (!request.signal.aborted)
        error.value = message(cause, "任务加载失败，请重试。");
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    () => [query.value.keyword, query.value.subject, query.value.status],
    () => {
      if (query.value.page !== 1) query.value.page = 1;
      else void refresh();
    },
  );
  watch(
    () => query.value.page,
    () => void refresh(),
    { immediate: true },
  );
  function reset() {
    query.value = { page: 1, pageSize: 8 };
  }
  function close() {
    if (saving.value) return;
    detailController?.abort();
    modalOpen.value = false;
  }
  function openCreate() {
    if (saving.value) return;
    detailController?.abort();
    editingId.value = undefined;
    editing.value = null;
    form.value = emptyForm();
    formError.value = "";
    conflict.value = false;
    detailLoading.value = false;
    detailFailed.value = false;
    modalOpen.value = true;
  }
  async function openEdit(id: string) {
    if (saving.value) return;
    detailController?.abort();
    const request = new AbortController();
    detailController = request;
    editingId.value = id;
    editing.value = null;
    modalOpen.value = true;
    detailLoading.value = true;
    detailFailed.value = false;
    formError.value = "";
    conflict.value = false;
    try {
      const task = await getTask(id, request.signal);
      if (!request.signal.aborted) {
        editing.value = task;
        form.value = {
          title: task.title,
          subject: task.subject,
          description: task.description,
          status: task.status,
        };
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        detailFailed.value = true;
        formError.value = message(cause, "详情加载失败，请重试。");
      }
    } finally {
      if (!request.signal.aborted) detailLoading.value = false;
    }
  }
  async function reloadDetail() {
    if (
      editingId.value &&
      !saving.value &&
      (!editing.value || window.confirm("重载将替换当前草稿，确定吗？"))
    )
      await openEdit(editingId.value);
  }
  async function save() {
    if (
      saving.value ||
      detailLoading.value ||
      detailFailed.value ||
      conflict.value
    )
      return;
    formError.value = "";
    for (const [key, max, label] of [
      ["title", 160, "任务名称"],
      ["subject", 64, "科目"],
      ["description", 10000, "任务说明"],
    ] as const) {
      const length = [...form.value[key].trim()].length;
      if (!length || length > max) {
        formError.value = label + "须为1–" + max + "字符。";
        return;
      }
    }
    saving.value = true;
    notice.value = "";
    const input = {
      title: form.value.title,
      subject: form.value.subject,
      description: form.value.description,
    };
    try {
      if (editingId.value) {
        if (!editing.value) throw new Error("Missing detail");
        await updateTask({
          ...input,
          id: editingId.value,
          status: form.value.status,
          expectedVersion: editing.value.version,
        });
      } else await createTask(input);
      modalOpen.value = false;
      notice.value = "任务定义已保存。";
      notifyTaskChange();
      if (query.value.page !== 1) query.value.page = 1;
      else await refresh();
    } catch (cause) {
      conflict.value =
        cause instanceof ServiceError && cause.statusCode === 409;
      formError.value = message(
        cause,
        "保存结果未确认；草稿保留，请先刷新列表核对，勿直接重复创建。",
      );
    } finally {
      saving.value = false;
    }
  }
  async function changeStatus(id: string) {
    const task = items.value.find((item) => item.id === id);
    if (!task) return;
    if (pendingIds.value.includes(task.id)) return;
    pendingIds.value = [...pendingIds.value, task.id];
    notice.value = "";
    try {
      await setTaskStatus({
        id: task.id,
        status: task.status === "enabled" ? "disabled" : "enabled",
        expectedVersion: task.version,
      });
      notice.value = "任务状态已更新。";
      notifyTaskChange();
      await refresh();
    } catch (cause) {
      notice.value = message(cause, "状态更新未确认，请刷新核对。");
      if (cause instanceof ServiceError && cause.statusCode === 409)
        await refresh();
    } finally {
      pendingIds.value = pendingIds.value.filter((id) => id !== task.id);
    }
  }
  onScopeDispose(() => {
    listController?.abort();
    detailController?.abort();
  });
  useTaskInvalidation(refresh);
  return {
    query,
    items,
    total,
    loading,
    error,
    notice,
    modalOpen,
    editingId,
    form,
    formError,
    detailLoading,
    detailFailed,
    saving,
    conflict,
    pendingIds,
    refresh,
    reset,
    close,
    openCreate,
    openEdit,
    reloadDetail,
    save,
    changeStatus,
    loadTaskSubjects,
  };
}
