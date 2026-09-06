<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
const route = useRoute();
const { student, loading, error, notFound, refresh } = useStudentDetail(() =>
  String(route.params.id),
);
const recordColumns: TableColumnType[] = [
  { title: "发生日期", key: "occurredOn", width: 130 },
  { title: "分类", key: "category", width: 90 },
  { title: "学习记录", key: "content" },
  { title: "记录人", key: "authorName", width: 100 },
];
const taskColumns: TableColumnType[] = [
  { title: "任务", key: "title" },
  { title: "截止日期", key: "dueDate", width: 140 },
  { title: "状态", key: "status", width: 100 },
];
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/students">← 返回学员管理</NuxtLink>
    <ASkeleton v-if="loading" active aria-label="正在加载学生详情" />
    <AResult
      v-else-if="notFound"
      status="404"
      title="未找到学生"
      sub-title="请返回学员管理重新选择学生"
    />
    <AAlert
      v-else-if="error"
      type="error"
      show-icon
      :message="error"
      role="alert"
    >
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <template v-else-if="student">
      <div class="detail-context-row">
        <span class="prototype-note"
          >S2 · 基本信息与合同聚合已接入；学习记录、计划和任务后续接入</span
        >
      </div>
      <div class="detail-layout">
        <BasicInfoPanel :student="student" />
        <div class="detail-main">
          <DeferredStudentSection
            title="学习记录"
            description="记录学生的学习表现与跟进情况"
            :columns="recordColumns"
          >
            <template #action
              ><AButton type="primary" class="primary-green-button" disabled
                >＋ 新增记录（后续接入）</AButton
              ></template
            >
            <template #filters>
              <AInput
                class="detail-search"
                disabled
                placeholder="搜索记录内容（后续接入）"
              />
              <ASelect
                class="detail-filter"
                disabled
                placeholder="分类：全部"
              />
              <ARangePicker
                class="record-date-range"
                disabled
                separator="至"
                :placeholder="['开始日期', '结束日期']"
              />
            </template>
          </DeferredStudentSection>
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
