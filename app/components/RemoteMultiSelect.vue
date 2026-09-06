<script setup lang="ts">
import { computed, ref, watch, type VNode } from "vue";
import type { OptionLoader } from "~/services/contracts";
const props = defineProps<{ loader: OptionLoader; disabled?: boolean }>();
const model = defineModel<string[]>({ default: () => [] });
const { items, selected, keyword, loading, error, hasMore, refresh } =
  useRemoteOptions(
    () => props.loader,
    () => model.value,
  );
const labels = ref<Record<string, string>>({});
watch(items, (values) => {
  for (const item of values) labels.value[item.value] = item.label;
});
const options = computed(() => [
  ...model.value
    .filter((id) => !items.value.some((item) => item.value === id))
    .map((id) => ({
      value: id,
      label:
        selected.value.find((item) => item.value === id)?.label ??
        (props.loader.selected ? "已选学生 " + id : (labels.value[id] ?? id)),
    })),
  ...items.value,
]);
const VNodes = (p: { vnodes: VNode }) => p.vnodes;
</script>
<template>
  <ASelect
    v-model:value="model"
    mode="multiple"
    :options="options"
    :disabled="disabled"
    placeholder="可多选学生"
    show-search
    :filter-option="false"
    :loading="loading"
    :not-found-content="loading ? '加载中…' : error || '暂无学生'"
    @search="(value: string) => (keyword = value)"
    @dropdown-visible-change="
      (open: boolean) => {
        if (open) refresh();
      }
    "
  >
    <template #dropdownRender="{ menuNode }"
      ><VNodes :vnodes="menuNode" />
      <div v-if="error || hasMore" style="padding: 8px" @mousedown.prevent>
        <span v-if="error" role="alert">{{ error }}</span
        ><AButton
          v-if="error"
          size="small"
          :loading="loading"
          @click="refresh()"
          >重试</AButton
        ><AButton v-else size="small" :loading="loading" @click="refresh(true)"
          >加载更多</AButton
        >
      </div></template
    >
  </ASelect>
</template>
