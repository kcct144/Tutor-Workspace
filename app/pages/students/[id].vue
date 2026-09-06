<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
const route = useRoute();
const { student, loading, error, notFound, refresh } = useStudentDetail(() =>
  String(route.params.id),
);
const taskColumns: TableColumnType[] = [
  { title: "任务", key: "title" },
  { title: "截止日期", key: "dueDate", width: 140 },
  { title: "状态", key: "status", width: 100 },
];
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/students">← 返回学员管理</NuxtLink>
    <ASkeleton
      v-if="loading && !student"
      active
      aria-label="正在加载学生详情"
    />
    <AResult
      v-else-if="notFound"
      status="404"
      title="未找到学生"
      sub-title="请返回学员管理重新选择学生"
    />
    <AAlert
      v-else-if="error && !student"
      type="error"
      show-icon
      :message="error"
      role="alert"
    >
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <template v-else-if="student">
      <AAlert v-if="error" type="error" :message="error" show-icon
        ><template #action
          ><AButton @click="refresh">重试基本信息</AButton></template
        ></AAlert
      >
      <p v-if="loading" role="status">正在刷新基本信息…</p>
      <div class="detail-context-row">
        <span class="prototype-note"
          >S4 · 基本信息、学习记录与计划已接入；任务后续接入</span
        >
      </div>
      <div class="detail-layout">
        <BasicInfoPanel :student="student" />
        <div class="detail-main">
          <LearningRecordsSection :key="student.id" :student-id="student.id" />
          <DeferredStudentSection
            title="任务列表"
            description="当前学生的任务安排"
            :columns="taskColumns"
          >
            <template #filters>
              <AInput
                class="detail-search"
                disabled
                placeholder="搜索任务名称（后续接入）"
              />
              <ASelect
                class="detail-filter"
                disabled
                placeholder="状态：全部"
              />
            </template>
          </DeferredStudentSection>
        </div>
      </div>
    </template>
  </div>
</template>
