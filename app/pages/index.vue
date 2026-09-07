<script setup lang="ts">
import { computed } from "vue";
import { studentGrades, type StudentGrade } from "../../types/api/students";
const {
  query,
  items,
  total,
  activeStudents,
  loading,
  error,
  refresh,
  change,
  showMessage,
  message,
  pendingIds,
  notice,
} = useHome();
const grades = ["全部", ...studentGrades];
const selectedGrade = computed<string>({
  get: () => query.value.grade ?? "全部",
  set: (value: string) => {
    query.value.grade = value === "全部" ? undefined : (value as StudentGrade);
  },
});
</script>
<template>
  <div class="home-page">
    <section class="page-intro">
      <div>
        <h1>
          我的学生 <span>{{ activeStudents }}</span>
        </h1>
      </div>
      <div class="intro-actions">
        <AButton class="action-button" @click="navigateTo('/students')"
          ><span class="action-icon">＋</span>添加学生</AButton
        >
        <AButton
          class="action-button"
          @click="showMessage('请从任务列表新增任务定义')"
          ><span class="action-icon">↗</span>新建任务</AButton
        >
        <ASelect
          v-model:value="selectedGrade"
          class="grade-select"
          aria-label="首页年级筛选"
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
      <span class="prototype-note">S6 · 在读学生与任务实时数据</span>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <ASkeleton v-if="loading" active aria-label="正在加载首页学生" />
    <AAlert v-else-if="error" type="error" :message="error" show-icon
      ><template #action
        ><AButton @click="refresh">重试</AButton></template
      ></AAlert
    >
    <div v-else-if="items.length" class="student-grid">
      <article v-for="student in items" :key="student.id" class="student-card">
        <div class="student-card-head">
          <div>
            <h2>
              {{ student.name
              }}<span
                v-if="
                  student.expiresInDays !== null &&
                  student.expiresInDays >= 0 &&
                  student.expiresInDays <= 7
                "
                class="expiry-tag"
                >{{ student.expiresInDays }} 天后到期</span
              >
            </h2>
            <span class="grade-label"
              >{{ student.grade ?? "年级待确认"
              }}<template v-if="student.subjects.length">
                · {{ student.subjects.join("、") }}</template
              ></span
            >
          </div>
          <span class="task-progress"
            >{{ student.completedCount }}/{{
              student.pendingCount + student.completedCount
            }}</span
          >
        </div>
        <div class="plan-row">
          <div class="plan-tags"><PlanTags :plans="student.plans" /></div>
        </div>
        <div class="task-groups">
          <HomeTaskGroup
            title="未完成"
            :tasks="student.pendingTasks"
            :remaining="student.pendingRemaining"
            :completed="false"
            :pending-ids="pendingIds"
            @change="change"
          /><HomeTaskGroup
            title="已完成"
            :tasks="student.completedTasks"
            :remaining="student.completedRemaining"
            :completed="true"
            :pending-ids="pendingIds"
            @change="change"
          /><span v-if="!student.pendingCount && !student.completedCount"
            >暂无任务</span
          >
        </div>
        <NuxtLink class="detail-link" :to="'/students/' + student.id"
          >查看详情 <span>→</span></NuxtLink
        >
      </article>
    </div>
    <AEmpty v-else description="暂无符合条件的在读学生" class="empty-state" />
    <APagination
      v-if="!loading && !error && total > 0"
      v-model:current="query.page"
      :total="total"
      :page-size="query.pageSize"
      :show-size-changer="false"
      style="margin-top: 20px"
    />
    <Transition name="toast"
      ><div v-if="message" class="toast-message">{{ message }}</div></Transition
    >
  </div>
</template>
