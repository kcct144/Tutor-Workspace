<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { getStudents } from "~/mocks/services/students";
import { getTaskAssignments, getTaskDefinitions } from "~/mocks/services/tasks";
import type {
  TaskAssignment,
  TaskAssignmentStatus,
  TaskDefinitionStatus,
} from "~/types/tasks";

const AS_OF_DATE = "2026-09-05";
const students = getStudents();
const tasks = getTaskDefinitions();
const assignments = ref<TaskAssignment[]>(getTaskAssignments());
const keyword = ref("");
const selectedSubject = ref("全部");
const selectedStatus = ref<TaskAssignmentStatus | "全部">("全部");
const selectedDueState = ref<"全部" | "已逾期" | "今天到期" | "未来到期">(
  "全部",
);
const createModalOpen = ref(false);
const createError = ref("");
const operationMessage = ref("");
const createForm = ref({
  taskId: "",
  studentIds: [] as string[],
  dueDate: "2026-09-08",
});

const taskNameMap = new Map(tasks.map((task) => [task.id, task.title]));
const studentNameMap = new Map(
  students.map((student) => [student.id, student.name]),
);
const taskSubjectMap = new Map(tasks.map((task) => [task.id, task.subject]));
const enabledTaskOptions = tasks
  .filter((task) => task.status === ("启用" as TaskDefinitionStatus))
  .map((task) => ({ label: task.title, value: task.id }));
const studentOptions = [
  { label: "全部", value: "全部" },
  ...students.map((student) => ({ label: student.name, value: student.id })),
];
const subjectOptions = [
  "全部",
  ...Array.from(new Set(tasks.map((task) => task.subject).filter(Boolean))),
];
const statusOptions: Array<TaskAssignmentStatus | "全部"> = [
  "全部",
  "待完成",
  "进行中",
  "已完成",
  "已跳过",
  "已取消",
];
const dueStateOptions = ["全部", "已逾期", "今天到期", "未来到期"] as const;

const rows = computed(() =>
  assignments.value
    .map((assignment) => ({
      ...assignment,
      taskName: taskNameMap.get(assignment.taskId) ?? "未知任务",
      studentName: studentNameMap.get(assignment.studentId) ?? "未知学生",
      subject: taskSubjectMap.get(assignment.taskId) ?? "—",
      dueState: getDueState(assignment),
    }))
    .sort((a, b) => {
      if (a.dueState === "已逾期" && b.dueState !== "已逾期") return -1;
      if (a.dueState !== "已逾期" && b.dueState === "已逾期") return 1;
      return a.dueDate.localeCompare(b.dueDate);
    }),
);
const filteredAssignments = computed(() => {
  const query = keyword.value.trim();
  return rows.value.filter((assignment) => {
    const matchesKeyword =
      !query ||
      assignment.taskName.includes(query) ||
      assignment.studentName.includes(query);
    const matchesSubject =
      selectedSubject.value === "全部" ||
      assignment.subject === selectedSubject.value;
    const matchesStatus =
      selectedStatus.value === "全部" ||
      assignment.status === selectedStatus.value;
    const matchesDue =
      selectedDueState.value === "全部" ||
      assignment.dueState === selectedDueState.value;
    return matchesKeyword && matchesSubject && matchesStatus && matchesDue;
  });
});

const columns: TableColumnType[] = [
  { title: "任务", key: "taskName", width: 280 },
  { title: "学生", key: "studentName", width: 120 },
  { title: "科目", key: "subject", width: 100 },
  { title: "状态", key: "status", width: 100 },
  { title: "截止时间", key: "dueDate", width: 125 },
  { title: "分配时间", key: "assignedAt", width: 125 },
  { title: "完成时间", key: "completedAt", width: 125 },
  { title: "操作", key: "action", width: 95, fixed: "right" },
];

function getDueState(assignment: TaskAssignment) {
  if (["已完成", "已跳过", "已取消"].includes(assignment.status)) return "—";
  if (assignment.dueDate < AS_OF_DATE) return "已逾期";
  if (assignment.dueDate === AS_OF_DATE) return "今天到期";
  return "未来到期";
}

function resetFilters() {
  keyword.value = "";
  selectedSubject.value = "全部";
  selectedStatus.value = "全部";
  selectedDueState.value = "全部";
}

function openCreateModal() {
  createForm.value = {
    taskId: enabledTaskOptions[0]?.value ?? "",
    studentIds: [],
    dueDate: "2026-09-08",
  };
  createError.value = "";
  createModalOpen.value = true;
}

function submitAssignment() {
  if (!createForm.value.taskId) {
    createError.value = "请选择任务";
    return;
  }
  if (createForm.value.studentIds.length === 0) {
    createError.value = "请选择至少一名学生";
    return;
  }
  if (!createForm.value.dueDate) {
    createError.value = "请选择截止时间";
    return;
  }
  const duplicateStudents = createForm.value.studentIds.filter((studentId) =>
    assignments.value.some(
      (item) =>
        item.taskId === createForm.value.taskId &&
        item.studentId === studentId &&
        !["已完成", "已跳过", "已取消"].includes(item.status),
    ),
  );
  if (duplicateStudents.length > 0) {
    createError.value = `已有 ${duplicateStudents.length} 名学生存在未完成分配`;
    return;
  }
  createForm.value.studentIds.forEach((studentId) => {
    assignments.value.unshift({
      id: `assign-${Date.now()}-${studentId}`,
      taskId: createForm.value.taskId,
      studentId,
      assignedBy: "u-001",
      status: "待完成",
      assignedAt: AS_OF_DATE,
      dueDate: createForm.value.dueDate,
      updatedAt: AS_OF_DATE,
    });
  });
  createModalOpen.value = false;
  operationMessage.value = `已为 ${createForm.value.studentIds.length} 名学生创建分配（仅本次会话）`;
}

function toggleAssignmentCompleted(id: string, completed: boolean) {
  const assignment = assignments.value.find((item) => item.id === id);
  if (!assignment) return;
  assignment.status = completed ? "已完成" : "待完成";
  assignment.completedAt = completed ? AS_OF_DATE : undefined;
  assignment.updatedAt = AS_OF_DATE;
  operationMessage.value = "任务状态已更新（仅本次会话）";
}
</script>

<template>
  <div class="task-assignments-page students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">TASK ASSIGNMENTS</p>
        <h1>
          任务分配 <span>{{ filteredAssignments.length }}</span>
        </h1>
      </div>
      <span class="prototype-note">原型数据 · 仅本次会话有效</span>
    </section>

    <section class="task-assignment-toolbar students-toolbar">
      <AInput
        v-model:value="keyword"
        class="student-search"
        allow-clear
        placeholder="搜索任务或学生"
      />
      <label class="student-filter-control">
        <span>科目</span>
        <ASelect
          v-model:value="selectedSubject"
          class="student-filter"
          :options="subjectOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control">
        <span>状态</span>
        <ASelect
          v-model:value="selectedStatus"
          class="student-filter"
          :options="statusOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control">
        <span>时效</span>
        <ASelect
          v-model:value="selectedDueState"
          class="student-filter"
          :options="dueStateOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <AButton class="reset-button" @click="resetFilters">重置筛选</AButton>
      <AButton
        type="primary"
        class="primary-green-button"
        @click="openCreateModal"
        >＋ 新建分配</AButton
      >
    </section>
    <p v-if="operationMessage" class="task-operation-message">
      {{ operationMessage }}
    </p>

    <section class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="filteredAssignments"
        empty-text="暂无符合条件的任务分配"
      >
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'taskName'" class="task-title-cell">
            <strong>{{ record.taskName }}</strong>
            <span>{{ record.subject }}</span>
          </div>
          <NuxtLink
            v-else-if="column.key === 'studentName'"
            class="student-name-link"
            :to="`/students/${record.studentId}`"
          >
            {{ record.studentName }}
          </NuxtLink>
          <span v-else-if="column.key === 'subject'" class="muted-cell">{{
            record.subject
          }}</span>
          <ATag
            v-else-if="column.key === 'status'"
            class="assignment-status-tag"
            :class="`assignment-status-${record.status}`"
          >
            {{ record.status }}
          </ATag>
          <span
            v-else-if="column.key === 'dueDate'"
            class="assignment-due-cell"
            :class="{
              overdue: record.dueState === '已逾期',
              today: record.dueState === '今天到期',
            }"
          >
            {{ record.dueDate }}
            <small v-if="record.dueState !== '—'">{{ record.dueState }}</small>
          </span>
          <span v-else-if="column.key === 'assignedAt'" class="muted-cell">{{
            record.assignedAt
          }}</span>
          <span v-else-if="column.key === 'completedAt'" class="muted-cell">{{
            record.completedAt ?? "—"
          }}</span>
          <ACheckbox
            v-else-if="column.key === 'action'"
            :checked="record.status === '已完成'"
            aria-label="切换任务完成状态"
            @change="
              toggleAssignmentCompleted(record.id, $event.target.checked)
            "
          />
        </template>
      </BaseDataTable>
    </section>

    <a-modal
      v-model:open="createModalOpen"
      title="新建任务分配"
      ok-text="创建分配"
      cancel-text="取消"
      @ok="submitAssignment"
    >
      <div class="record-form task-assignment-form">
        <label>
          任务
          <ASelect
            v-model:value="createForm.taskId"
            :options="enabledTaskOptions"
            placeholder="选择启用中的任务"
          />
        </label>
        <label>
          学生
          <ASelect
            v-model:value="createForm.studentIds"
            mode="multiple"
            :options="studentOptions.slice(1)"
            placeholder="可多选学生"
          />
        </label>
        <label>
          截止时间
          <ADatePicker
            v-model:value="createForm.dueDate"
            value-format="YYYY-MM-DD"
            class="task-assignment-date-picker"
          />
        </label>
        <span v-if="createError" class="record-form-error">{{
          createError
        }}</span>
      </div>
    </a-modal>
  </div>
</template>
