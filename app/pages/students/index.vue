<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { getStudents } from "~/mocks/services/students";
import type { StudentGrade, StudentStatus } from "~/types/students";

const students = ref(getStudents());
const keyword = ref("");
const selectedGrade = ref<StudentGrade | "全部">("全部");
const selectedStatus = ref<StudentStatus | "全部">("全部");

const gradeOptions = ["全部", "初一", "初二", "初三", "高一", "高二"];
const statusOptions = ["全部", "在读", "待分配", "已结课"];
const filteredStudents = computed(() => {
  const query = keyword.value.trim();
  return students.value.filter((student) => {
    const matchesKeyword = !query || student.name.includes(query);
    const matchesGrade =
      selectedGrade.value === "全部" || student.grade === selectedGrade.value;
    const matchesStatus =
      selectedStatus.value === "全部" ||
      student.status === selectedStatus.value;
    return matchesKeyword && matchesGrade && matchesStatus;
  });
});

const columns: TableColumnType[] = [
  { title: "姓名", dataIndex: "name", key: "name", width: 150 },
  { title: "学校", dataIndex: "school", key: "school", width: 240 },
  { title: "班级", key: "class", width: 110 },
  { title: "学习计划", key: "plans", width: 260 },
  { title: "科目", key: "subjects", width: 170 },
  { title: "状态", dataIndex: "status", key: "status", width: 110 },
  { title: "到期时间", dataIndex: "expiryDate", key: "expiryDate", width: 140 },
  { title: "操作", key: "action", width: 100, fixed: "right" },
];

function resetFilters() {
  keyword.value = "";
  selectedGrade.value = "全部";
  selectedStatus.value = "全部";
}
</script>

<template>
  <div class="students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">STUDENT DIRECTORY</p>
        <h1>
          学员管理 <span>{{ filteredStudents.length }}</span>
        </h1>
      </div>
      <span class="prototype-note">原型数据 · 仅本次会话有效</span>
    </section>

    <section class="students-toolbar">
      <AInput
        v-model:value="keyword"
        class="student-search"
        allow-clear
        placeholder="搜索学员姓名"
      />
      <label class="student-filter-control">
        <span>年级</span>
        <ASelect
          v-model:value="selectedGrade"
          class="student-filter"
          aria-label="按年级筛选"
          :options="gradeOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control">
        <span>状态</span>
        <ASelect
          v-model:value="selectedStatus"
          class="student-filter"
          aria-label="按状态筛选"
          :options="statusOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <AButton class="reset-button" @click="resetFilters">重置筛选</AButton>
    </section>

    <section class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="filteredStudents"
        empty-text="暂无符合条件的学员"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'class'">
            <span class="muted-cell">{{ record.className }}</span>
          </template>
          <template v-else-if="column.key === 'plans'">
            <div class="table-plan-tags">
              <ATag v-for="plan in record.plans" :key="plan" class="plan-tag">{{
                plan
              }}</ATag>
            </div>
          </template>
          <template v-else-if="column.key === 'subjects'">
            <div class="table-subject-tags">
              <ATag
                v-for="subject in record.subjects"
                :key="subject"
                class="subject-tag"
              >
                {{ subject }}
              </ATag>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <ATag class="status-tag" :class="`status-${record.status}`">{{
              record.status
            }}</ATag>
          </template>
          <template v-else-if="column.key === 'action'">
            <NuxtLink class="table-detail-link" :to="`/students/${record.id}`"
              >查看详情</NuxtLink
            >
          </template>
          <template v-else-if="column.key === 'name'">
            <NuxtLink
              class="student-name-link"
              :to="`/students/${record.id}`"
              >{{ record.name }}</NuxtLink
            >
          </template>
        </template>
      </BaseDataTable>
    </section>
  </div>
</template>
