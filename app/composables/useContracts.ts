import { onScopeDispose, ref, watch } from "vue";
import {
  createContract,
  updateContract,
  terminateTrialContract,
  getContract,
  getContracts,
} from "~/services/contracts";
import { ServiceError } from "~/services/http";
import {
  notifyStudentChange,
  useStudentInvalidation,
} from "./useStudentInvalidation";
import type {
  Contract,
  ContractQuery,
  ContractWrite,
} from "../../types/api/contracts";

export function useContracts() {
  const query = ref<ContractQuery>({ page: 1, pageSize: 8 });
  const items = ref<Contract[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref("");
  const modalOpen = ref(false),
    editing = ref<Contract | null>(null),
    detailLoading = ref(false),
    formError = ref(""),
    saving = ref(false),
    terminatingId = ref<string | null>(null),
    conflict = ref(false),
    notice = ref("");
  const detailFailed = ref(false),
    isEditing = ref(false);
  let controller: AbortController | undefined,
    detailController: AbortController | undefined;
  let editingId: string | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    items.value = [];
    try {
      const page = await getContracts(query.value, request.signal);
      if (!request.signal.aborted) {
        items.value = page.items;
        total.value = page.total;
      }
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "无法加载合同，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    () => [
      query.value.keyword,
      query.value.studentId,
      query.value.subject,
      query.value.contractType,
      query.value.status,
    ],
    () => {
      if (query.value.page !== 1) query.value.page = 1;
      else void refresh();
    },
  );
  watch(
    () => query.value.page,
    () => {
      void refresh();
    },
    { immediate: true },
  );
  function reset() {
    query.value = { page: 1, pageSize: 8 };
  }
  function openCreate() {
    editingId = undefined;
    isEditing.value = false;
    detailFailed.value = false;
    detailController?.abort();
    editing.value = null;
    detailLoading.value = false;
    formError.value = "";
    conflict.value = false;
    modalOpen.value = true;
  }
  async function openEdit(id: string) {
    editingId = id;
    modalOpen.value = true;
    detailLoading.value = true;
    formError.value = "";
    conflict.value = false;
    isEditing.value = true;
    detailFailed.value = false;
    editing.value = null;
    detailController?.abort();
    const request = new AbortController();
    detailController = request;
    try {
      const contract = await getContract(id, request.signal);
      if (!request.signal.aborted) editing.value = contract;
    } catch (cause) {
      if (!request.signal.aborted) {
        detailFailed.value = true;
        formError.value =
          cause instanceof ServiceError
            ? cause.message
            : "详情加载失败，请重试。";
      }
    } finally {
      if (!request.signal.aborted) detailLoading.value = false;
    }
  }
  function close() {
    if (saving.value) return;
    modalOpen.value = false;
    detailController?.abort();
  }
  async function reloadDetail() {
    if (editingId) await openEdit(editingId);
  }
  async function save(input: ContractWrite) {
    if (
      saving.value ||
      detailLoading.value ||
      detailFailed.value ||
      conflict.value
    )
      return;
    saving.value = true;
    formError.value = "";
    conflict.value = false;
    notice.value = "";
    try {
      if (editingId && !editing.value) throw new Error("missing detail");
      if (editingId)
        await updateContract({
          ...input,
          id: editingId,
          expectedVersion: editing.value!.version,
        });
      else await createContract(input);
      modalOpen.value = false;
      notifyStudentChange();
      notice.value = "合同已保存；关联学生科目和到期时间将按最新合同读取。";
      if (query.value.page !== 1) query.value.page = 1;
      else await refresh();
    } catch (cause) {
      conflict.value =
        cause instanceof ServiceError && cause.statusCode === 409;
      formError.value =
        cause instanceof ServiceError
          ? cause.message
          : "保存结果未确认，请先刷新列表核对，不要直接重复创建。";
    } finally {
      saving.value = false;
    }
  }
  async function terminateTrial(id: string) {
    const contract = items.value.find((item) => item.id === id);
    if (
      !contract ||
      contract.contractType !== "trial" ||
      contract.trialStatus !== "active" ||
      terminatingId.value
    )
      return;
    terminatingId.value = id;
    error.value = "";
    notice.value = "";
    try {
      await terminateTrialContract({ id, expectedVersion: contract.version });
      notifyStudentChange();
      notice.value = "体验合同已终止；关联学生科目已按最新状态刷新。";
      await refresh();
    } catch (cause) {
      error.value =
        cause instanceof ServiceError
          ? cause.message
          : "终止结果未确认，请先刷新列表核对。";
    } finally {
      terminatingId.value = null;
    }
  }
  useStudentInvalidation(refresh);
  onScopeDispose(() => {
    controller?.abort();
    detailController?.abort();
  });
  return {
    query,
    items,
    total,
    loading,
    error,
    refresh,
    reset,
    modalOpen,
    editing,
    detailLoading,
    detailFailed,
    isEditing,
    formError,
    saving,
    terminatingId,
    conflict,
    notice,
    openCreate,
    openEdit,
    close,
    save,
    reloadDetail,
    terminateTrial,
  };
}
