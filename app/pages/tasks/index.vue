<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
const {
  query,
  items,
  total,
  loading,
  error,
  notice,
  modalOpen,
  editingId,
  form,
  formError,
  detailLoading,
  detailFailed,
  saving,
  conflict,
  pendingIds,
  refresh,
  reset,
  close,
  openCreate,
  openEdit,
  reloadDetail,
  save,
  changeStatus,
  loadTaskSubjects,
} = useTasks();
const statusOptions = [
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "停用" },
];
const columns: TableColumnType[] = [
  { title: "任务名称", key: "title", width: 300 },
  { title: "科目", key: "subject", width: 100 },
  { title: "状态", key: "status", width: 100 },
  { title: "分配人数", key: "assignmentCount", width: 100 },
  { title: "更新时间", key: "updatedAt", width: 170 },
  { title: "操作", key: "action", width: 190, fixed: "right" },
];
</script>
<template>
  <div class="tasks-page students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">TASK LIBRARY</p>
        <h1>
          任务列表 <span>{{ total }}</span>
        </h1>
      </div>
      <span class="prototype-note">S5 · 真实任务定义 · 分配后续接入</span>
    </section>
    <section class="tasks-toolbar students-toolbar">
      <AInput
        v-model:value="query.keyword"
        class="student-search"
        allow-clear
        :maxlength="64"
        placeholder="搜索任务名称、科目或说明"
      />
      <label class="student-filter-control"
        ><span>科目</span
        ><RemoteSelect
          v-model="query.subject"
          :loader="loadTaskSubjects"
          class="student-filter"
          aria-label="按科目筛选"
      /></label>
      <label class="student-filter-control"
        ><span>状态</span
        ><ASelect
          v-model:value="query.status"
          allow-clear
          placeholder="全部"
          class="student-filter"
          aria-label="按任务状态筛选"
          :options="statusOptions"
      /></label>
      <AButton class="reset-button" @click="reset">重置筛选</AButton>
      <AButton
        type="primary"
        class="primary-green-button"
        :disabled="saving"
        @click="openCreate"
        >＋ 新增任务</AButton
      >
    </section>
    <p v-if="notice" role="status" class="task-operation-message">
      {{ notice }}
    </p>
    <AAlert v-if="error" type="error" :message="error" show-icon
      ><template #action
        ><AButton @click="refresh">重试</AButton></template
      ></AAlert
    >
    <section class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="items.map((item) => ({ ...item }))"
        :loading="loading"
        :current="query.page"
        :page-size="query.pageSize"
        :total="total"
        :scroll-x="1000"
        :empty-text="error ? '加载失败，请重试' : '暂无符合条件的任务'"
        @change="(pagination) => (query.page = pagination.current ?? 1)"
      >
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'title'" class="task-title-cell">
            <strong>{{ record.title }}</strong
            ><span>{{ record.description }}</span>
          </div>
          <span v-else-if="column.key === 'subject'" class="muted-cell">{{
            record.subject
          }}</span>
          <ATag
            v-else-if="column.key === 'status'"
            class="task-definition-status"
            :class="
              'task-definition-' +
              (record.status === 'enabled' ? '启用' : '停用')
            "
            >{{ record.status === "enabled" ? "启用" : "停用" }}</ATag
          >
          <span
            v-else-if="column.key === 'assignmentCount'"
            class="task-count-cell"
            >{{ record.assignmentCount }} 人</span
          >
          <span v-else-if="column.key === 'updatedAt'" class="muted-cell">{{
            record.updatedAt
          }}</span>
          <div v-else-if="column.key === 'action'" class="task-action-group">
            <AButton
              type="link"
              class="table-action-button"
              :disabled="saving || pendingIds.includes(record.id)"
              @click="openEdit(record.id)"
              >编辑</AButton
            >
            <NuxtLink class="table-action-link" to="/tasks/assignments"
              >分配管理</NuxtLink
            >
            <AButton
              type="link"
              class="table-action-button"
              :loading="pendingIds.includes(record.id)"
              :disabled="pendingIds.includes(record.id)"
              @click="changeStatus(record.id)"
              >{{ record.status === "enabled" ? "停用" : "启用" }}</AButton
            >
          </div>
        </template>
      </BaseDataTable>
    </section>
    <AModal
      :open="modalOpen"
      :title="editingId ? '编辑任务' : '新增任务'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      :ok-button-props="{ disabled: detailLoading || detailFailed || conflict }"
      :cancel-button-props="{ disabled: saving }"
      :closable="!saving"
      :mask-closable="!saving"
      :keyboard="!saving"
      @ok="save"
      @cancel="close"
    >
      <ASpin v-if="detailLoading" tip="加载任务详情…" />
      <div v-else-if="!detailFailed" class="record-form task-form">
        <label
          >任务名称<AInput
            v-model:value="form.title"
            :disabled="saving"
            placeholder="例如：完成一元二次方程练习"
        /></label>
        <label
          >科目<AInput
            v-model:value="form.subject"
            :disabled="saving"
            placeholder="例如：数学"
        /></label>
        <label
          >任务状态<ASelect
            v-model:value="form.status"
            :disabled="saving || !editingId"
            :options="statusOptions"
        /></label>
        <label
          >任务说明<textarea
            v-model="form.description"
            :disabled="saving"
            class="ant-input task-description-input"
            rows="5"
            placeholder="描述学生需要完成的内容和验收要求"
          />
        </label>
      </div>
      <p v-if="formError" role="alert" class="record-form-error">
        {{ formError }}
      </p>
      <AButton
        v-if="conflict || detailFailed"
        :disabled="saving"
        @click="reloadDetail"
        >重载最新版本</AButton
      >
    </AModal>
  </div>
</template>
