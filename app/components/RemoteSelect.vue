<script setup lang="ts">
import { computed, type VNode } from "vue";
import type { OptionLoader } from "~/services/contracts";
const props = withDefaults(
  defineProps<{
    loader: OptionLoader;
    selectedLabel?: string;
    disabled?: boolean;
    placeholder?: string;
  }>(),
  { selectedLabel: undefined, disabled: false, placeholder: "全部" },
);
const model = defineModel<string | undefined>();
const { items, selected, keyword, loading, error, hasMore, refresh } =
  useRemoteOptions(
    () => props.loader,
    () => (model.value ? [model.value] : []),
  );
const options = computed(() =>
  model.value &&
  !items.value.some((item) => item.value === model.value) &&
  (props.selectedLabel || props.loader.selected)
    ? [
        {
          value: model.value,
          label:
            selected.value.find((item) => item.value === model.value)?.label ??
            (props.loader.selected
              ? "已选学生 " + model.value
              : props.selectedLabel),
        },
        ...items.value,
      ]
    : items.value,
);
const VNodes = (p: { vnodes: VNode }) => p.vnodes;
</script>
<template>
  <ASelect
    v-model:value="model"
    :options="options"
    :disabled="disabled"
    :placeholder="placeholder"
    allow-clear
    show-search
    :filter-option="false"
    :loading="loading"
    :not-found-content="loading ? '加载中…' : error || '暂无选项'"
    @search="(value: string) => (keyword = value)"
    @dropdown-visible-change="
      (open: boolean) => {
        if (open) refresh();
      }
    "
  >
    <template #dropdownRender="{ menuNode }">
      <VNodes :vnodes="menuNode" />
      <div v-if="error || hasMore" style="padding: 8px" @mousedown.prevent>
        <span v-if="error" role="alert">{{ error }}</span>
        <AButton v-if="error" size="small" :loading="loading" @click="refresh()"
          >重试</AButton
        >
        <AButton v-else size="small" :loading="loading" @click="refresh(true)"
          >加载更多</AButton
        >
      </div>
    </template>
  </ASelect>
</template>
