<script setup lang="ts">
const route = useRoute();
const { student, loading, error, notFound, refresh } = useStudentDetail(() =>
  String(route.params.id),
);
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/students">← 返回学员管理</NuxtLink>
    <ASkeleton
      v-if="loading && !student"
      active
      aria-label="正在加载学生详情"
    />
    <AResult
      v-else-if="notFound"
      status="404"
      title="未找到学生"
      sub-title="请返回学员管理重新选择学生"
    />
    <AAlert
      v-else-if="error && !student"
      type="error"
      show-icon
      :message="error"
      role="alert"
    >
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <template v-else-if="student">
      <AAlert v-if="error" type="error" :message="error" show-icon
        ><template #action
          ><AButton @click="refresh">重试基本信息</AButton></template
        ></AAlert
      >
      <p v-if="loading" role="status">正在刷新基本信息…</p>
      <div class="detail-context-row">
        <span class="prototype-note"
          >S6 · 学生、学习记录、计划与任务已接入</span
        >
      </div>
      <div class="detail-layout">
        <BasicInfoPanel :student="student" />
        <div class="detail-main">
          <LearningRecordsSection :key="student.id" :student-id="student.id" />
          <AssignmentsSection
            :key="'tasks-' + student.id"
            :student-id="student.id"
          />
        </div>
      </div>
    </template>
  </div>
</template>
