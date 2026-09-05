<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
import { studentGrades, studentStatuses } from "../../../types/api/students";

const {
  items,
  total,
  page,
  pageSize,
  keyword,
  grade,
  status,
  loading,
  error,
  refresh,
  reset,
  changePage,
} = useStudents();
const gradeOptions = ["全部", ...studentGrades];
const statusOptions = ["全部", ...studentStatuses];
const columns: TableColumnType[] = [
  { title: "姓名", dataIndex: "name", key: "name", width: 150 },
  { title: "学校", dataIndex: "school", key: "school", width: 240 },
  { title: "班级", key: "class", width: 110 },
  { title: "学习计划", key: "plans", width: 260 },
  { title: "科目", key: "subjects", width: 170 },
  { title: "状态", dataIndex: "status", key: "status", width: 110 },
  { title: "到期时间", key: "expiryDate", width: 140 },
  { title: "操作", key: "action", width: 100, fixed: "right" },
];
</script>

<template>
  <div class="students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">STUDENT DIRECTORY</p>
        <h1>
          学员管理 <span>{{ total }}</span>
        </h1>
      </div>
      <span class="prototype-note">S1 · 学生基础已接入，其他模块后续接入</span>
    </section>
    <section class="students-toolbar">
      <AInput
        v-model:value="keyword"
        class="student-search"
        allow-clear
        placeholder="搜索学员姓名"
        :maxlength="64"
      />
      <label class="student-filter-control"
        ><span>年级</span>
        <ASelect
          v-model:value="grade"
          class="student-filter"
          aria-label="按年级筛选"
          :options="gradeOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control"
        ><span>状态</span>
        <ASelect
          v-model:value="status"
          class="student-filter"
          aria-label="按状态筛选"
          :options="statusOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <AButton class="reset-button" @click="reset">重置筛选</AButton>
    </section>
    <AAlert v-if="error" type="error" show-icon :message="error" role="alert">
      <template #action
        ><AButton :loading="loading" @click="refresh">重试</AButton></template
      >
    </AAlert>
    <section v-else class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="items"
        :current="page"
        :total="total"
        :page-size="pageSize"
        :loading="loading"
        empty-text="暂无符合条件的学员"
        @change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'class'" class="muted-cell">{{
            record.className ?? "—"
          }}</span>
          <span
            v-else-if="
              ['plans', 'subjects', 'expiryDate'].includes(String(column.key))
            "
            class="muted-cell"
            >后续接入</span
          >
          <span v-else-if="column.key === 'school'">{{
            record.school ?? "—"
          }}</span>
          <ATag
            v-else-if="column.key === 'status'"
            class="status-tag"
            :class="`status-${record.status}`"
            >{{ record.status }}</ATag
          >
          <NuxtLink
            v-else-if="column.key === 'action'"
            class="table-detail-link"
            :to="`/students/${record.id}`"
            >查看详情</NuxtLink
          >
          <NuxtLink
            v-else-if="column.key === 'name'"
            class="student-name-link"
            :to="`/students/${record.id}`"
            >{{ record.name }}</NuxtLink
          >
        </template>
      </BaseDataTable>
    </section>
  </div>
</template>
