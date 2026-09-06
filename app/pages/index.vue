<script setup lang="ts">
import { computed, ref } from "vue";
import { getHomeStudents, getHomeSummary } from "~/mocks/services/home";
import type { HomeStudent, StudentGrade } from "~/types/home";

const students = ref<HomeStudent[]>(getHomeStudents());
const summary = getHomeSummary();
const selectedGrade = ref<StudentGrade | "全部">("全部");
const message = ref("");
const grades: Array<StudentGrade | "全部"> = [
  "全部",
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
];
const visibleStudents = computed(() =>
  selectedGrade.value === "全部"
    ? students.value
    : students.value.filter((student) => student.grade === selectedGrade.value),
);

function toggleTask(studentId: string, taskId: string, checked: boolean) {
  const student = students.value.find((item) => item.id === studentId);
  const task = student?.tasks.find((item) => item.id === taskId);
  if (task) task.completed = checked;
}

function showMessage(text: string) {
  message.value = text;
  window.setTimeout(() => (message.value = ""), 2200);
}

function pendingTasks(student: HomeStudent) {
  return student.tasks.filter((task) => !task.completed).slice(0, 3);
}

function completedTasks(student: HomeStudent) {
  return student.tasks.filter((task) => task.completed).slice(0, 3);
}

function pendingTaskCount(student: HomeStudent) {
  return student.tasks.filter((task) => !task.completed).length;
}

function completedTaskCount(student: HomeStudent) {
  return student.tasks.filter((task) => task.completed).length;
}
</script>

<template>
  <div class="home-page">
    <section class="page-intro">
      <div>
        <h1>
          我的学生 <span>{{ summary.activeStudents }}</span>
        </h1>
      </div>
      <div class="intro-actions">
        <AButton
          class="action-button"
          @click="showMessage('添加学生功能将在后续版本开放')"
          ><span class="action-icon">＋</span>添加学生</AButton
        >
        <AButton
          class="action-button"
          @click="showMessage('任务创建功能将在后续版本开放')"
          ><span class="action-icon">↗</span>新建任务</AButton
        >
        <ASelect
          v-model:value="selectedGrade"
          class="grade-select"
          :options="grades.map((grade) => ({ label: grade, value: grade }))"
        />
      </div>
    </section>

    <div class="toolbar-line">
      <div class="filter-pills" role="tablist" aria-label="年级筛选">
        <button
          v-for="grade in grades"
          :key="grade"
          class="filter-pill"
          :class="{ active: selectedGrade === grade }"
          type="button"
          @click="selectedGrade = grade"
        >
          {{ grade }}
        </button>
      </div>
      <span class="prototype-note"
        >首页学生与任务仍为原型 · 真实聚合后续接入</span
      >
    </div>

    <div v-if="visibleStudents.length" class="student-grid">
      <article
        v-for="student in visibleStudents"
        :key="student.id"
        class="student-card"
      >
        <div class="student-card-head">
          <div>
            <h2>
              {{ student.name }}
              <span
                v-if="
                  student.expiresInDays !== undefined &&
                  student.expiresInDays >= 0 &&
                  student.expiresInDays <= 7
                "
                class="expiry-tag"
              >
                {{ student.expiresInDays }} 天后到期
              </span>
            </h2>
            <span class="grade-label">
              {{ student.grade
              }}<template v-if="student.subjects.length">
                · {{ student.subjects.join("、") }}</template
              >
            </span>
          </div>
          <span class="task-progress"
            >{{ student.tasks.filter((task) => task.completed).length }}/{{
              student.tasks.length
            }}</span
          >
        </div>
        <div class="plan-row">
          <div class="plan-tags">
            <span>学习计划后续接入</span>
          </div>
        </div>
        <div class="task-groups">
          <div v-if="pendingTasks(student).length" class="task-group">
            <span class="task-group-title">未完成</span>
            <div class="task-list">
              <label
                v-for="task in pendingTasks(student)"
                :key="task.id"
                class="task-item"
              >
                <a-checkbox
                  :checked="task.completed"
                  @change="
                    (event) =>
                      toggleTask(student.id, task.id, event.target.checked)
                  "
                /><span>{{ task.title }}</span>
              </label>
              <span v-if="pendingTaskCount(student) > 3" class="more-tasks">
                +{{ pendingTaskCount(student) - 3 }} 条未完成任务
              </span>
            </div>
          </div>
          <div v-if="completedTasks(student).length" class="task-group">
            <span class="task-group-title">已完成</span>
            <div class="task-list">
              <label
                v-for="task in completedTasks(student)"
                :key="task.id"
                class="task-item done"
              >
                <a-checkbox
                  :checked="task.completed"
                  @change="
                    (event) =>
                      toggleTask(student.id, task.id, event.target.checked)
                  "
                /><span>{{ task.title }}</span>
              </label>
              <span v-if="completedTaskCount(student) > 3" class="more-tasks">
                +{{ completedTaskCount(student) - 3 }} 条已完成任务
              </span>
            </div>
          </div>
        </div>
        <NuxtLink class="detail-link" :to="`/students/${student.id}`"
          >查看详情 <span>→</span></NuxtLink
        >
      </article>
    </div>
    <a-empty v-else description="暂无符合条件的学生" class="empty-state" />
    <Transition name="toast"
      ><div v-if="message" class="toast-message">{{ message }}</div></Transition
    >
  </div>
</template>
