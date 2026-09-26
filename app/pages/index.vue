<script setup lang="ts">
import { computed, ref } from "vue";
import { studentGrades, type StudentGrade } from "../../types/api/students";
import type { HomeStudent } from "../../types/api/home";
import { loadStudentTagOptions } from "~/services/student-tags";
const {
  query,
  items,
  activeStudents,
  subjectConfigurationRequired,
  loading,
  error,
  refresh,
  change,
  showMessage,
  message,
  pendingIds,
  notice,
  useResponsibleSubjects,
  useAllSubjects,
  settingsOpen,
  responsibleSubjects,
} = useHome();
const grades = ["全部", ...studentGrades];
const selectedGrade = computed<string>({
  get: () => query.value.grade ?? "全部",
  set: (value: string) => {
    query.value.grade = value === "全部" ? undefined : (value as StudentGrade);
  },
});
const selectedSubjects = computed<string[]>({
  get: () =>
    query.value.subjectMode === "responsible"
      ? responsibleSubjects.value
      : query.value.subjectMode === "selected"
        ? (query.value.subject ?? [])
        : [],
  set: (subjects) => {
    query.value = {
      ...query.value,
      page: 1,
      subjectMode: subjects.length ? "selected" : "all",
      subject: subjects.length ? subjects : undefined,
    };
  },
});
const quickStudent = ref<{ id: string; name: string } | null>(null);
const quickRecordOpen = ref(false);
function beginQuickRecord(student: HomeStudent) {
  quickStudent.value = { id: student.id, name: student.name };
  quickRecordOpen.value = true;
}
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
        <SubjectMultiSelect
          v-model="selectedSubjects"
          class="home-subject-filter"
          placeholder="全部科目"
          aria-label="首页科目筛选"
        />
        <AButton class="action-button" @click="useResponsibleSubjects"
          >恢复我的负责科目</AButton
        >
        <RemoteSelect
          v-model="query.tag"
          :loader="loadStudentTagOptions"
          :selected-label="query.tag"
          placeholder="全部学生标签"
          aria-label="学生标签筛选"
          style="width: 180px; max-width: 100%"
        />
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
      <span class="prototype-note">在读学生 · 待办与最新动态</span>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <AAlert
      v-if="subjectConfigurationRequired && !loading && !error"
      type="info"
      show-icon
      message="尚未配置负责学科"
      description="请先在个人设置中配置负责学科，或清空科目筛选查看权限范围内的全部学生。"
      class="subject-configuration-alert"
    >
      <template #action>
        <div class="subject-configuration-actions">
          <AButton size="small" @click="useAllSubjects">查看全部科目</AButton>
          <AButton size="small" @click="settingsOpen = true"
            >打开个人设置</AButton
          >
        </div>
      </template>
    </AAlert>
    <ASkeleton v-if="loading" active aria-label="正在加载首页学生" />
    <AAlert v-else-if="error" type="error" :message="error" show-icon
      ><template #action
        ><AButton @click="refresh">重试</AButton></template
      ></AAlert
    >
    <div v-else-if="items.length" class="student-grid">
      <HomeStudentCard
        v-for="student in items"
        :key="student.id"
        :student="student"
        :pending-ids="pendingIds"
        @change="change"
        @quick-record="beginQuickRecord"
      />
    </div>
    <AEmpty
      v-else
      :description="
        subjectConfigurationRequired
          ? '配置负责学科后显示默认学生视图'
          : '暂无符合条件的在读学生'
      "
      class="empty-state"
    />
    <Transition name="toast"
      ><div v-if="message" class="toast-message">{{ message }}</div></Transition
    >
    <QuickRecordDialog
      v-model:open="quickRecordOpen"
      :student="quickStudent"
      @saved="showMessage('学习记录已新增。')"
    />
  </div>
</template>
<style scoped>
.intro-actions {
  flex-wrap: wrap;
  min-width: 0;
}
.home-subject-filter {
  width: 220px;
  max-width: 100%;
}
.subject-configuration-alert {
  margin-bottom: 16px;
}
.subject-configuration-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-pills {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}
.filter-pill {
  flex-shrink: 0;
  white-space: nowrap;
}
@media (max-width: 600px) {
  .page-intro {
    align-items: stretch;
  }
  .intro-actions {
    width: 100%;
  }
  .home-subject-filter {
    width: 100%;
  }
  .toolbar-line {
    min-width: 0;
  }
}
</style>
