<script setup lang="ts">
import type { TableColumnType, TablePaginationConfig } from "ant-design-vue";

interface Props {
  columns: TableColumnType[];
  dataSource: Record<string, unknown>[];
  rowKey?: string;
  pageSize?: number;
  current?: number;
  total?: number;
  scrollX?: number;
  loading?: boolean;
  emptyText?: string;
}

withDefaults(defineProps<Props>(), {
  rowKey: "id",
  pageSize: 8,
  current: undefined,
  total: undefined,
  scrollX: undefined,
  loading: false,
  emptyText: "暂无数据",
});

const emit = defineEmits<{ change: [pagination: TablePaginationConfig] }>();

function handleChange(pagination: TablePaginationConfig) {
  emit("change", pagination);
}
</script>

<template>
  <ATable
    :columns="columns"
    :data-source="dataSource"
    :row-key="rowKey"
    :loading="loading"
    :scroll="scrollX ? { x: scrollX } : undefined"
    :pagination="{
      pageSize,
      current,
      total,
      hideOnSinglePage: true,
      showSizeChanger: false,
    }"
    :locale="{ emptyText }"
    class="base-data-table"
    @change="handleChange"
  >
    <template #bodyCell="slotProps">
      <slot name="bodyCell" v-bind="slotProps" />
    </template>
  </ATable>
</template>
