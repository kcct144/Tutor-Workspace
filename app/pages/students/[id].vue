<script setup lang="ts">
import { computed } from "vue";
import { getHomeStudents } from "~/mocks/services/home";

const route = useRoute();
const student = computed(() =>
  getHomeStudents().find((item) => item.id === route.params.id),
);
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/">← 返回工作台</NuxtLink>
    <a-result
      v-if="!student"
      status="404"
      title="未找到学生"
      sub-title="请返回工作台重新选择学生"
    />
    <template v-else>
      <p class="eyebrow">STUDENT PROFILE</p>
      <h1>{{ student.name }}</h1>
      <p class="detail-meta">{{ student.grade }} · {{ student.className }}</p>
      <div class="detail-card">
        <div class="detail-section">
          <span>学习计划</span>
          <div>
            <ATag v-for="plan in student.plans" :key="plan" class="plan-tag">{{
              plan
            }}</ATag>
          </div>
        </div>
        <div class="detail-section">
          <span>任务</span>
          <div
            v-for="task in student.tasks"
            :key="task.id"
            class="detail-task"
            :class="{ done: task.completed }"
          >
            {{ task.completed ? "✓" : "○" }} {{ task.title }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 850px;
  margin: 0 auto;
  padding: 42px 36px 60px;
}
.back-link {
  color: #55785b;
  font-size: 13px;
  text-decoration: none;
}
.detail-page h1 {
  margin-top: 24px;
}
.detail-meta {
  margin: 8px 0 26px;
  color: #89938c;
  font-size: 13px;
}
.detail-card {
  padding: 24px;
  border: 1px solid #e1e6df;
  border-radius: 12px;
  background: #fff;
}
.detail-section + .detail-section {
  margin-top: 25px;
  padding-top: 22px;
  border-top: 1px solid #edf0eb;
}
.detail-section > span {
  display: block;
  margin-bottom: 12px;
  color: #89938c;
  font-size: 12px;
}
.detail-task {
  margin-top: 9px;
  color: #47544c;
  font-size: 13px;
}
.detail-task.done {
  color: #a3aaa4;
  text-decoration: line-through;
}
@media (max-width: 760px) {
  .detail-page {
    padding: 28px 16px 42px;
  }
}
</style>
