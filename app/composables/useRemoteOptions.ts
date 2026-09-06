import { computed, onScopeDispose, ref, watch } from "vue";
import type { OptionLoader, RemoteOption } from "~/services/contracts";
import { useStudentInvalidation } from "./useStudentInvalidation";
export function useRemoteOptions(
  loader: () => OptionLoader,
  selectedIds: () => string[] = () => [],
) {
  const selected = ref<RemoteOption[]>([]);
  const items = ref<RemoteOption[]>([]),
    keyword = ref(""),
    page = ref(1),
    total = ref(0),
    loading = ref(false),
    error = ref("");
  let controller: AbortController | undefined;
  async function refresh(append = false) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    selected.value = [];
    const nextPage = append ? page.value + 1 : 1;
    if (!append) {
      items.value = [];
      total.value = 0;
    }
    try {
      const [result, selectedResult] = await Promise.all([
        loader()(
          {
            keyword: keyword.value.trim() || undefined,
            page: nextPage,
            pageSize: 20,
          },
          request.signal,
        ),
        loader().selected && selectedIds().length
          ? loader().selected!(selectedIds(), request.signal)
          : Promise.resolve<RemoteOption[]>([]),
      ]);
      if (request.signal.aborted) return;
      items.value = append ? [...items.value, ...result.items] : result.items;
      selected.value = selectedResult;
      total.value = result.total;
      page.value = nextPage;
    } catch {
      if (!request.signal.aborted) error.value = "选项加载失败，请重试";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch(
    [keyword, loader, () => selectedIds().join(",")],
    () => {
      void refresh();
    },
    { immediate: true },
  );
  onScopeDispose(() => controller?.abort());
  useStudentInvalidation(() => refresh());
  return {
    items,
    selected,
    keyword,
    loading,
    error,
    hasMore: computed(() => items.value.length < total.value),
    refresh,
  };
}
