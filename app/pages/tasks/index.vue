<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { getTaskAssignments, getTaskDefinitions } from "~/mocks/services/tasks";
import type { TaskDefinition, TaskDefinitionStatus } from "~/types/tasks";

type TaskForm = {
  title: string;
  subject: string;
  description: string;
  status: TaskDefinitionStatus;
};

const tasks = ref<TaskDefinition[]>(getTaskDefinitions());
const assignments = ref(getTaskAssignments());
const keyword = ref("");
const selectedSubject = ref("全部");
const selectedStatus = ref<TaskDefinitionStatus | "全部">("全部");
const modalOpen = ref(false);
const editingId = ref<string | undefined>();
const formError = ref("");
const operationMessage = ref("");
const form = ref<TaskForm>(createEmptyForm());

const subjectOptions = computed(() => [
  "全部",
  ...Array.from(
    new Set(tasks.value.map((task) => task.subject).filter(Boolean)),
  ),
]);
const statusOptions: Array<TaskDefinitionStatus | "全部"> = [
  "全部",
  "草稿",
  "启用",
  "停用",
];
const rows = computed(() =>
  tasks.value.map((task) => ({
    ...task,
    assignmentCount: assignments.value.filter((item) => item.taskId === task.id)
      .length,
  })),
);
const filteredTasks = computed(() => {
  const query = keyword.value.trim();
  return rows.value.filter((task) => {
    const matchesKeyword =
      !query ||
      task.title.includes(query) ||
      task.description.includes(query) ||
      task.subject.includes(query);
    const matchesSubject =
      selectedSubject.value === "全部" ||
      task.subject === selectedSubject.value;
    const matchesStatus =
      selectedStatus.value === "全部" || task.status === selectedStatus.value;
    return matchesKeyword && matchesSubject && matchesStatus;
  });
});

const columns: TableColumnType[] = [
  { title: "任务名称", key: "title", width: 300 },
  { title: "科目", key: "subject", width: 100 },
  { title: "状态", key: "status", width: 100 },
  { title: "分配人数", key: "assignmentCount", width: 100 },
  { title: "更新时间", key: "updatedAt", width: 130 },
  { title: "操作", key: "action", width: 170, fixed: "right" },
];

function createEmptyForm(): TaskForm {
  return { title: "", subject: "", description: "", status: "启用" };
}

function resetFilters() {
  keyword.value = "";
  selectedSubject.value = "全部";
  selectedStatus.value = "全部";
}

function openCreateModal() {
  editingId.value = undefined;
  form.value = createEmptyForm();
  formError.value = "";
  modalOpen.value = true;
}

function openEditModal(id: string) {
  const task = tasks.value.find((item) => item.id === id);
  if (!task) return;
  editingId.value = id;
  form.value = {
    title: task.title,
    subject: task.subject,
    description: task.description,
    status: task.status,
  };
  formError.value = "";
  modalOpen.value = true;
}

function validateForm() {
  if (!form.value.title.trim()) return "请填写任务名称";
  if (!form.value.subject.trim()) return "请填写科目";
  if (!form.value.description.trim()) return "请填写任务说明";
  return "";
}

function submitForm() {
  formError.value = validateForm();
  if (formError.value) return;
  const now = "2026-09-05";
  const nextTask: TaskDefinition = {
    id: editingId.value ?? `task-${Date.now()}`,
    ownerUserId: "u-001",
    title: form.value.title.trim(),
    subject: form.value.subject.trim(),
    description: form.value.description.trim(),
    status: form.value.status,
    createdAt: editingId.value
      ? (tasks.value.find((task) => task.id === editingId.value)?.createdAt ??
        now)
      : now,
    updatedAt: now,
  };
  if (editingId.value) {
    const index = tasks.value.findIndex((task) => task.id === editingId.value);
    if (index >= 0) tasks.value[index] = nextTask;
    operationMessage.value = "任务定义已更新（仅本次会话）";
  } else {
    tasks.value.unshift(nextTask);
    operationMessage.value = "任务定义已创建（仅本次会话）";
  }
  modalOpen.value = false;
}

function toggleTaskStatus(taskId: string) {
  const task = tasks.value.find((item) => item.id === taskId);
  if (!task) return;
  if (task.status === "草稿") {
    operationMessage.value = "草稿任务请先编辑后再启用";
    return;
  }
  task.status = task.status === "启用" ? "停用" : "启用";
  task.updatedAt = "2026-09-05";
  operationMessage.value = `${task.title} 已${task.status === "启用" ? "启用" : "停用"}（仅本次会话）`;
}
</script>

<template>
  <div class="tasks-page students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">TASK LIBRARY</p>
        <h1>
          任务列表 <span>{{ filteredTasks.length }}</span>
        </h1>
      </div>
      <span class="prototype-note">原型数据 · 仅本次会话有效</span>
    </section>

    <section class="tasks-toolbar students-toolbar">
      <AInput
        v-model:value="keyword"
        class="student-search"
        allow-clear
        placeholder="搜索任务名称、科目或说明"
      />
      <label class="student-filter-control">
        <span>科目</span>
        <ASelect
          v-model:value="selectedSubject"
          class="student-filter"
          aria-label="按科目筛选"
          :options="subjectOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control">
        <span>状态</span>
        <ASelect
          v-model:value="selectedStatus"
          class="student-filter"
          aria-label="按任务状态筛选"
          :options="statusOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <AButton class="reset-button" @click="resetFilters">重置筛选</AButton>
      <AButton
        type="primary"
        class="primary-green-button"
        @click="openCreateModal"
      >
        ＋ 新增任务
      </AButton>
    </section>
    <p v-if="operationMessage" class="task-operation-message">
      {{ operationMessage }}
    </p>

    <section class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="filteredTasks"
        empty-text="暂无符合条件的任务"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="task-title-cell">
              <strong>{{ record.title }}</strong>
              <span>{{ record.description }}</span>
            </div>
          </template>
          <span v-else-if="column.key === 'subject'" class="muted-cell">{{
            record.subject
          }}</span>
          <ATag
            v-else-if="column.key === 'status'"
            class="task-definition-status"
            :class="`task-definition-${record.status}`"
          >
            {{ record.status }}
          </ATag>
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
              @click="openEditModal(record.id)"
              >编辑</AButton
            >
            <NuxtLink class="table-action-link" to="/tasks/assignments"
              >分配管理</NuxtLink
            >
            <AButton
              v-if="record.status !== '草稿'"
              type="link"
              class="table-action-button"
              @click="toggleTaskStatus(record.id)"
            >
              {{ record.status === "启用" ? "停用" : "启用" }}
            </AButton>
          </div>
        </template>
      </BaseDataTable>
    </section>

    <a-modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑任务' : '新增任务'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitForm"
    >
      <div class="record-form task-form">
        <label>
          任务名称
          <AInput
            v-model:value="form.title"
            placeholder="例如：完成一元二次方程练习"
          />
        </label>
        <label>
          科目
          <AInput v-model:value="form.subject" placeholder="例如：数学" />
        </label>
        <label>
          任务状态
          <ASelect
            v-model:value="form.status"
            :options="
              statusOptions.slice(1).map((value) => ({ label: value, value }))
            "
          />
        </label>
        <label>
          任务说明
          <textarea
            v-model="form.description"
            class="ant-input task-description-input"
            rows="5"
            placeholder="描述学生需要完成的内容和验收要求"
          />
        </label>
        <span v-if="formError" class="record-form-error">{{ formError }}</span>
      </div>
    </a-modal>
  </div>
</template>
