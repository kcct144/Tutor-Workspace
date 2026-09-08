import { ref, computed, watch, onMounted, onScopeDispose } from "vue";
import type { PlanDetail, PlanListItem } from "../../types/api/study-plans";
import { getPlans, getPlan, updatePlan } from "~/services/study-plans";
import { ServiceError } from "~/services/http";
import { useTaskInvalidation } from "./useTaskInvalidation";
export function useStudyPlans(initialId: () => string = () => "") {
  const items = ref<PlanListItem[]>([]),
    total = ref(0),
    page = ref(1),
    pageSize = 20,
    keyword = ref("");
  const listLoading = ref(false),
    listError = ref(""),
    detailLoading = ref(false),
    detailError = ref("");
  const selectedId = ref(""),
    selectedPlan = ref<PlanDetail | null>(null),
    isEditing = ref(false),
    draftContent = ref(""),
    saving = ref(false),
    saveMessage = ref(""),
    saveError = ref(""),
    conflict = ref(false);
  const dirty = computed(
    () => isEditing.value && draftContent.value !== selectedPlan.value?.content,
  );
  let listController: AbortController | undefined,
    detailController: AbortController | undefined,
    disposed = false;
  const errorText = (cause: unknown, fallback: string) =>
    cause instanceof ServiceError ? cause.message : fallback;
  const canLeave = () =>
    !saving.value &&
    (!dirty.value || window.confirm("当前学习计划有未保存修改，确定放弃吗？"));
  async function loadDetail(id: string) {
    detailController?.abort();
    const request = new AbortController();
    detailController = request;
    detailLoading.value = true;
    detailError.value = "";
    try {
      const detail = await getPlan(id, request.signal);
      if (!request.signal.aborted) {
        selectedPlan.value = detail;
        return true;
      }
    } catch (cause) {
      if (!request.signal.aborted)
        detailError.value = errorText(cause, "读取计划失败，请重试。");
    } finally {
      if (!request.signal.aborted) detailLoading.value = false;
    }
    return false;
  }
  async function selectPlan(id: string) {
    if (id === selectedId.value || !canLeave()) return;
    selectedId.value = id;
    selectedPlan.value = null;
    isEditing.value = false;
    draftContent.value = "";
    saveMessage.value = "";
    saveError.value = "";
    conflict.value = false;
    await loadDetail(id);
  }
  async function refreshList() {
    listController?.abort();
    const request = new AbortController();
    listController = request;
    listLoading.value = true;
    listError.value = "";
    items.value = [];
    total.value = 0;
    try {
      const result = await getPlans(
        {
          page: page.value,
          pageSize,
          keyword: keyword.value.trim() || undefined,
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      items.value = result.items;
      total.value = result.total;
      if (!selectedId.value && result.items[0])
        void selectPlan(result.items[0].id);
    } catch (cause) {
      if (!request.signal.aborted)
        listError.value = errorText(cause, "读取列表失败，请重试。");
    } finally {
      if (!request.signal.aborted) listLoading.value = false;
    }
  }
  function startEditing() {
    if (!selectedPlan.value || saving.value || detailLoading.value) return;
    draftContent.value = selectedPlan.value.content;
    isEditing.value = true;
    saveError.value = "";
    saveMessage.value = "";
    conflict.value = false;
  }
  function cancelEditing() {
    if (saving.value || detailLoading.value) return;
    isEditing.value = false;
    draftContent.value = selectedPlan.value?.content ?? "";
    saveError.value = "";
    conflict.value = false;
  }
  async function saveEditing() {
    if (
      !selectedPlan.value ||
      saving.value ||
      detailLoading.value ||
      conflict.value
    )
      return;
    if (
      !draftContent.value.trim() ||
      [...draftContent.value.trim()].length > 100000
    ) {
      saveError.value = "正文去除首尾空白后须为1–100000字符。";
      return;
    }
    saving.value = true;
    saveError.value = "";
    saveMessage.value = "";
    const input = {
      id: selectedPlan.value.id,
      expectedVersion: selectedPlan.value.version,
      content: draftContent.value,
    };
    try {
      const result = await updatePlan(input);
      if (disposed) return;
      selectedPlan.value = result;
      draftContent.value = result.content;
      isEditing.value = false;
      saveMessage.value = "计划正文已保存。";
      await refreshList();
    } catch (cause) {
      if (!disposed) {
        conflict.value =
          cause instanceof ServiceError && cause.statusCode === 409;
        saveError.value = errorText(
          cause,
          "保存结果不明，草稿已保留，请核对最新版本后再操作。",
        );
      }
    } finally {
      if (!disposed) saving.value = false;
    }
  }
  async function reloadLatest() {
    if (saving.value || detailLoading.value || !selectedId.value) return;
    if (dirty.value && !window.confirm("重载将替换当前草稿，确定继续吗？"))
      return;
    const id = selectedId.value;
    const loaded = await loadDetail(id);
    if (loaded && selectedId.value === id && !disposed) {
      draftContent.value = selectedPlan.value?.content ?? "";
      conflict.value = false;
      saveError.value = "";
    }
  }
  watch(keyword, () => {
    if (page.value !== 1) page.value = 1;
    else void refreshList();
  });
  watch(page, () => void refreshList(), { immediate: true });
  watch(
    initialId,
    (id) => {
      if (id) void selectPlan(id);
    },
    { immediate: true },
  );
  useTaskInvalidation(async () => {
    await refreshList();
    if (selectedId.value && !saving.value) await loadDetail(selectedId.value);
  });
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value || saving.value) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  onMounted(() => window.addEventListener("beforeunload", beforeUnload));
  onScopeDispose(() => {
    disposed = true;
    listController?.abort();
    detailController?.abort();
    if (typeof window !== "undefined")
      window.removeEventListener("beforeunload", beforeUnload);
  });
  return {
    items,
    total,
    page,
    pageSize,
    keyword,
    listLoading,
    listError,
    detailLoading,
    detailError,
    selectedId,
    selectedPlan,
    isEditing,
    draftContent,
    saving,
    saveMessage,
    saveError,
    conflict,
    dirty,
    canLeave,
    selectPlan,
    refreshList,
    startEditing,
    cancelEditing,
    saveEditing,
    reloadLatest,
  };
}
