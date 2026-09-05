<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
defineProps<{
  title: string;
  description: string;
  columns: TableColumnType[];
}>();
</script>
<template>
  <section class="detail-section-card">
    <div class="section-heading">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <slot name="action" />
    </div>
    <div class="detail-toolbar"><slot name="filters" /></div>
    <BaseDataTable
      :columns="columns"
      :data-source="[]"
      :page-size="5"
      :empty-text="`${title}后续接入`"
    />
  </section>
</template>
