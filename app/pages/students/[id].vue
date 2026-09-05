<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumnType } from "ant-design-vue";
import BasicInfoPanel from "~/components/BasicInfoPanel.vue";
import {
  getLearningRecords,
  getStudent,
  getStudentTasks,
} from "~/mocks/services/student-detail";
import type {
  LearningRecordCategory,
  TaskStatus,
} from "~/types/student-detail";

const route = useRoute();
const student = computed(() => getStudent(String(route.params.id)));
const records = ref(student.value ? getLearningRecords(student.value.id) : []);
const tasks = ref(student.value ? getStudentTasks(student.value.id) : []);
const recordKeyword = ref("");
const recordCategory = ref<LearningRecordCategory | "全部">("全部");
const recordDateRange = ref<[string, string] | undefined>(undefined);
const taskKeyword = ref("");
const taskStatus = ref<TaskStatus | "全部">("全部");
const recordModalOpen = ref(false);
const recordError = ref("");
const recordForm = ref({
  category: "缺" as LearningRecordCategory,
  occurredOn: "2026-09-05",
  content: "",
});

const recordColumns: TableColumnType[] = [
  { title: "发生日期", dataIndex: "occurredOn", key: "occurredOn", width: 130 },
  { title: "分类", dataIndex: "category", key: "category", width: 90 },
  { title: "学习记录", dataIndex: "content", key: "content" },
  { title: "记录人", dataIndex: "authorName", key: "authorName", width: 100 },
];
const taskColumns: TableColumnType[] = [
  { title: "任务", dataIndex: "title", key: "title" },
  { title: "截止日期", dataIndex: "dueDate", key: "dueDate", width: 140 },
  { title: "状态", dataIndex: "status", key: "status", width: 100 },
];

const filteredRecords = computed(() =>
  records.value.filter((record) => {
    const matchesKeyword =
      !recordKeyword.value.trim() ||
      record.content.includes(recordKeyword.value.trim());
    const matchesCategory =
      recordCategory.value === "全部" ||
      record.category === recordCategory.value;
    const [startDate, endDate] = recordDateRange.value ?? [];
    const matchesDate =
      !startDate ||
      !endDate ||
      (record.occurredOn >= startDate && record.occurredOn <= endDate);
    return matchesKeyword && matchesCategory && matchesDate;
  }),
);
const filteredTasks = computed(() =>
  tasks.value.filter((task) => {
    const matchesKeyword =
      !taskKeyword.value.trim() ||
      task.title.includes(taskKeyword.value.trim());
    const matchesStatus =
      taskStatus.value === "全部" || task.status === taskStatus.value;
    return matchesKeyword && matchesStatus;
  }),
);

function openRecordModal() {
  recordForm.value = { category: "缺", occurredOn: "2026-09-05", content: "" };
  recordError.value = "";
  recordModalOpen.value = true;
}

function submitRecord() {
  if (!recordForm.value.content.trim()) {
    recordError.value = "请填写学习记录内容";
    return;
  }
  if (!recordForm.value.occurredOn) {
    recordError.value = "请选择发生日期";
    return;
  }
  if (!student.value) return;
  records.value.unshift({
    id: `record-${Date.now()}`,
    studentId: student.value.id,
    category: recordForm.value.category,
    content: recordForm.value.content.trim(),
    occurredOn: recordForm.value.occurredOn,
    authorName: "王老师",
  });
  recordModalOpen.value = false;
}
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/students">← 返回学员管理</NuxtLink>
    <a-result
      v-if="!student"
      status="404"
      title="未找到学生"
      sub-title="请返回学员管理重新选择学生"
    />
    <template v-else>
      <div class="detail-context-row">
        <span class="prototype-note">原型数据 · 仅本次会话有效</span>
      </div>
      <div class="detail-layout">
        <BasicInfoPanel :student="student" />
        <div class="detail-main">
          <section class="detail-section-card">
            <div class="section-heading">
              <div>
                <h2>学习记录</h2>
                <p>记录学生的学习表现与跟进情况</p>
              </div>
              <AButton
                type="primary"
                class="primary-green-button"
                @click="openRecordModal"
                >＋ 新增记录</AButton
              >
            </div>
            <div class="detail-toolbar">
              <AInput
                v-model:value="recordKeyword"
                class="detail-search"
                allow-clear
                placeholder="搜索记录内容"
              />
              <ASelect
                v-model:value="recordCategory"
                class="detail-filter"
                :options="
                  ['全部', '缺', '补', '强'].map((value) => ({
                    label: `分类：${value}`,
                    value,
                  }))
                "
              />
              <a-range-picker
                v-model:value="recordDateRange"
                value-format="YYYY-MM-DD"
                class="record-date-range"
                separator="至"
                :placeholder="['开始日期', '结束日期']"
              />
            </div>
            <BaseDataTable
              :columns="recordColumns"
              :data-source="filteredRecords"
              :page-size="5"
              empty-text="暂无学习记录"
            >
              <template #bodyCell="{ column, record }">
                <ATag
                  v-if="column.key === 'category'"
                  class="record-category-tag"
                  :class="`record-${record.category}`"
                  >{{ record.category }}</ATag
                >
                <span
                  v-else-if="column.key === 'content'"
                  class="record-content"
                  >{{ record.content }}</span
                >
              </template>
            </BaseDataTable>
          </section>

          <section class="detail-section-card">
            <div class="section-heading">
              <div>
                <h2>任务列表</h2>
                <p>当前学生的任务安排</p>
              </div>
            </div>
            <div class="detail-toolbar">
              <AInput
                v-model:value="taskKeyword"
                class="detail-search"
                allow-clear
                placeholder="搜索任务名称"
              />
              <ASelect
                v-model:value="taskStatus"
                class="detail-filter"
                :options="
                  ['全部', '待完成', '已完成'].map((value) => ({
                    label: `状态：${value}`,
                    value,
                  }))
                "
              />
            </div>
            <BaseDataTable
              :columns="taskColumns"
              :data-source="filteredTasks"
              :page-size="5"
              empty-text="暂无任务"
            >
              <template #bodyCell="{ column, record }">
                <span
                  v-if="column.key === 'status'"
                  class="task-status"
                  :class="{ done: record.status === '已完成' }"
                  >{{ record.status }}</span
                >
              </template>
            </BaseDataTable>
          </section>
        </div>
      </div>
    </template>

    <a-modal
      v-model:open="recordModalOpen"
      title="新增学习记录"
      ok-text="保存记录"
      cancel-text="取消"
      @ok="submitRecord"
    >
      <div class="record-form">
        <label
          >分类<ASelect
            v-model:value="recordForm.category"
            :options="
              ['缺', '补', '强'].map((value) => ({ label: value, value }))
            "
        /></label>
        <label
          >发生日期<a-date-picker
            v-model:value="recordForm.occurredOn"
            value-format="YYYY-MM-DD"
        /></label>
        <label
          >学习记录<a-textarea
            v-model:value="recordForm.content"
            :rows="4"
            placeholder="记录学生具体表现"
        /></label>
        <span v-if="recordError" class="record-form-error">{{
          recordError
        }}</span>
      </div>
    </a-modal>
  </div>
</template>
