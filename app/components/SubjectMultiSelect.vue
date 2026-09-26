<script setup lang="ts">
import { computed, onScopeDispose, ref } from "vue";
import { loadSubjectOptions } from "~/services/contracts";

withDefaults(
  defineProps<{
    disabled?: boolean;
    placeholder?: string;
    ariaLabel?: string;
  }>(),
  {
    disabled: false,
    placeholder: "选择负责学科",
    ariaLabel: "负责学科",
  },
);
const model = defineModel<string[]>({ default: () => [] });
const remoteOptions = ref<Array<{ label: string; value: string }>>([]);
const loading = ref(false);
const loadError = ref("");
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const options = computed(() => {
  const map = new Map(remoteOptions.value.map((item) => [item.value, item]));
  for (const value of model.value)
    if (!map.has(value)) map.set(value, { value, label: value });
  return [...map.values()];
});

async function load(keyword = "") {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  loadError.value = "";
  try {
    const page = await loadSubjectOptions(
      { keyword: keyword || undefined, page: 1, pageSize: 50 },
      request.signal,
    );
    if (!request.signal.aborted) remoteOptions.value = page.items;
  } catch {
    if (!request.signal.aborted)
      loadError.value = "科目选项加载失败，可直接输入。";
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}

function search(value: string) {
  clearTimeout(timer);
  timer = setTimeout(() => void load(value), 180);
}

onScopeDispose(() => {
  controller?.abort();
  clearTimeout(timer);
});
</script>

<template>
  <div class="subject-multi-select">
    <ASelect
      v-model:value="model"
      mode="tags"
      :options="options"
      :disabled="disabled"
      :loading="loading"
      :max-count="10"
      :max-tag-count="3"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :filter-option="false"
      @search="search"
      @dropdown-visible-change="(open: boolean) => open && load()"
    />
    <small v-if="loadError" class="subject-option-error">{{ loadError }}</small>
  </div>
</template>

<style scoped>
.subject-multi-select,
.subject-multi-select :deep(.ant-select) {
  width: 100%;
  min-width: 0;
}
.subject-option-error {
  display: block;
  margin-top: 4px;
  color: #a65f4b;
}
</style>
