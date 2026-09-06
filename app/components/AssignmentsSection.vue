<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
import { loadTaskSubjects } from "~/services/tasks";
const props = defineProps<{ studentId?: string }>();
const {
  query,
  items,
  total,
  loading,
  error,
  notice,
  pendingIds,
  refresh,
  reset,
  change,
} = useAssignments(() => props.studentId);
const statuses = [
  { value: "pending", label: "待完成" },
  { value: "completed", label: "已完成" },
];
const dueOptions = [
  { value: "overdue", label: "已逾期" },
  { value: "today", label: "今天到期" },
  { value: "upcoming", label: "未来到期" },
];
const dueLabels = {
  overdue: "已逾期",
  today: "今天到期",
  upcoming: "未来到期",
};
function dueLabel(value: unknown) {
  return value === "overdue" || value === "today" || value === "upcoming"
    ? dueLabels[value]
    : "";
}
const columns: TableColumnType[] = [
  { title: "任务", key: "taskTitle", width: 280 },
  ...(!props.studentId
    ? [{ title: "学生", key: "studentName", width: 120 }]
    : []),
  { title: "科目", key: "subject", width: 100 },
  { title: "状态", key: "status", width: 100 },
  { title: "截止时间", key: "dueDate", width: 125 },
  { title: "分配时间", key: "assignedAt", width: 170 },
  { title: "完成时间", key: "completedAt", width: 170 },
  { title: "操作", key: "action", width: 95, fixed: "right" },
];
</script>
<template>
  <section
    :class="
      studentId ? 'detail-section-card' : 'task-assignments-page students-page'
    "
  >
    <div v-if="studentId" class="section-heading">
      <div>
        <h2>
          任务列表 <span>{{ total }}</span>
        </h2>
        <p>当前学生的任务安排</p>
      </div>
    </div>
    <section v-else class="list-heading">
      <div>
        <p class="eyebrow">TASK ASSIGNMENTS</p>
        <h1>
          任务分配 <span>{{ total }}</span>
        </h1>
      </div>
      <span class="prototype-note">S6 · 真实任务分配</span>
    </section>
    <section
      :class="
        studentId
          ? 'detail-toolbar'
          : 'task-assignment-toolbar students-toolbar'
      "
    >
      <AInput
        v-model:value="query.keyword"
        :maxlength="64"
        allow-clear
        :class="studentId ? 'detail-search' : 'student-search'"
        placeholder="搜索任务或学生"
      />
      <label v-if="!studentId" class="student-filter-control"
        ><span>科目</span
        ><RemoteSelect
          v-model="query.subject"
          :loader="loadTaskSubjects"
          class="student-filter"
          aria-label="按分配科目筛选"
      /></label>
      <label class="student-filter-control"
        ><span>状态</span
        ><ASelect
          v-model:value="query.status"
          :options="statuses"
          allow-clear
          placeholder="全部"
          class="student-filter"
          aria-label="按分配状态筛选"
      /></label>
      <label v-if="!studentId" class="student-filter-control"
        ><span>时效</span
        ><ASelect
          v-model:value="query.dueState"
          :options="dueOptions"
          allow-clear
          placeholder="全部"
          class="student-filter"
          aria-label="按分配时效筛选"
      /></label>
      <AButton class="reset-button" @click="reset">重置筛选</AButton
      ><AssignmentCreate v-if="!studentId" />
    </section>
    <p v-if="notice" role="status" class="task-operation-message">
      {{ notice }}
    </p>
    <AAlert v-if="error" type="error" show-icon :message="error"
      ><template #action
        ><AButton @click="refresh">重试</AButton></template
      ></AAlert
    >
    <div class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="items.map((item) => ({ ...item }))"
        :loading="loading"
        :current="query.page"
        :page-size="query.pageSize"
        :total="total"
        :scroll-x="1000"
        :empty-text="error ? '加载失败，请重试' : '暂无符合条件的任务分配'"
        @change="(pagination) => (query.page = pagination.current ?? 1)"
      >
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'taskTitle'" class="task-title-cell">
            <strong>{{ record.taskTitle }}</strong
            ><span>{{ record.description }}</span>
          </div>
          <NuxtLink
            v-else-if="column.key === 'studentName'"
            class="student-name-link"
            :to="'/students/' + record.studentId"
            >{{ record.studentName }}</NuxtLink
          >
          <span v-else-if="column.key === 'subject'" class="muted-cell">{{
            record.subject
          }}</span>
          <ATag
            v-else-if="column.key === 'status'"
            class="assignment-status-tag"
            :class="
              'assignment-status-' +
              (record.status === 'completed' ? '已完成' : '待完成')
            "
            >{{ record.status === "completed" ? "已完成" : "待完成" }}</ATag
          >
          <span
            v-else-if="column.key === 'dueDate'"
            class="assignment-due-cell"
            :class="{
              overdue: record.dueState === 'overdue',
              today: record.dueState === 'today',
            }"
            >{{ record.dueDate
            }}<small v-if="record.dueState">{{
              dueLabel(record.dueState)
            }}</small></span
          >
          <span v-else-if="column.key === 'assignedAt'" class="muted-cell">{{
            record.assignedAt
          }}</span>
          <span v-else-if="column.key === 'completedAt'" class="muted-cell">{{
            record.completedAt ?? "—"
          }}</span>
          <AssignmentCheckbox
            v-else-if="column.key === 'action'"
            :status="record.status"
            :disabled="pendingIds.includes(record.id)"
            @change="(checked) => change(record.id, checked)"
          /> </template
      ></BaseDataTable>
    </div>
  </section>
</template>
