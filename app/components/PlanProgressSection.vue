<script setup lang="ts">
const props = defineProps<{ studentId: string }>();
const { items, loading, error, refresh } = useStudentPlanProgress(
  () => props.studentId,
);
</script>

<template>
  <section class="detail-section-card plan-progress-section">
    <div class="section-heading">
      <div>
        <h2>学习计划任务完成度</h2>
        <p>按任务分配创建时保存的计划归属统计</p>
      </div>
    </div>
    <ASpin v-if="loading && !items.length" tip="加载计划完成度…" />
    <AAlert v-else-if="error" type="error" show-icon :message="error">
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <p v-else-if="!items.length" class="plan-progress-empty">
      暂无关联学习计划
    </p>
    <div v-else class="plan-progress-grid">
      <article
        v-for="item in items"
        :key="item.plan.id"
        class="plan-progress-card"
      >
        <NuxtLink :to="{ path: '/plans', query: { planId: item.plan.id } }">
          {{ item.plan.title }}
        </NuxtLink>
        <template v-if="item.progressState === 'active'">
          <strong
            >{{ item.completedAssignments }} /
            {{ item.totalAssignments }}</strong
          >
          <AProgress :percent="item.progressPercent ?? 0" size="small" />
        </template>
        <p v-else>暂无任务</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.plan-progress-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}
.plan-progress-card {
  border: 1px solid #e4e9e8;
  border-radius: 10px;
  padding: 12px;
}
.plan-progress-card a {
  color: #236c57;
  font-weight: 700;
}
.plan-progress-card strong {
  display: block;
  margin: 10px 0 6px;
}
.plan-progress-card p,
.plan-progress-empty {
  color: #6f7b78;
  margin: 10px 0 0;
}
</style>
