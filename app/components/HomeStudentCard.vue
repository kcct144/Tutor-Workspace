<script setup lang="ts">
import type { HomeStudent, HomeActivity } from "../../types/api/home";
defineProps<{ student: HomeStudent; pendingIds: string[] }>();
defineEmits<{ change: [id: string, completed: boolean] }>();
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function activityText(activity: HomeActivity) {
  return activity.type === "task_completed"
    ? `完成了「${activity.taskTitle}」`
    : `添加学习记录：${activity.category} · ${activity.recordSummary}`;
}
function openStudent(event: MouseEvent | KeyboardEvent, id: string) {
  if (event.defaultPrevented) return;
  if (
    event instanceof KeyboardEvent &&
    (event.target !== event.currentTarget ||
      !["Enter", " "].includes(event.key))
  )
    return;
  event.preventDefault();
  void navigateTo("/students/" + id);
}
</script>
<template>
  <article
    class="student-card activity-card"
    role="link"
    tabindex="0"
    :aria-label="'查看' + student.name + '的学生详情'"
    @click="openStudent($event, student.id)"
    @keydown="openStudent($event, student.id)"
  >
    <div class="student-card-head">
      <div>
        <h2>
          <span class="student-name" :title="student.name">{{
            student.name
          }}</span
          ><span
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
    </div>
    <div class="card-labels">
      <div class="plan-row">
        <div class="plan-tags" @click.stop @keydown.stop>
          <PlanTags :plans="student.plans" />
        </div>
      </div>
      <div
        v-if="student.tags.length"
        class="student-labels"
        aria-label="学生标签"
      >
        <ATag v-for="tag in student.tags" :key="tag" color="cyan">{{
          tag
        }}</ATag>
      </div>
    </div>
    <section class="pending-section" aria-label="待办任务">
      <h3>待办任务</h3>
      <div
        v-for="task in student.pendingTasks"
        :key="task.id"
        class="pending-row"
      >
        <span class="check-target" @click.stop @keydown.stop
          ><AssignmentCheckbox
            status="pending"
            :disabled="pendingIds.includes(task.id)"
            :label="'完成 ' + task.taskTitle"
            @change="(value) => $emit('change', task.id, value)"
        /></span>
        <span class="ellipsis" :title="task.taskTitle">{{
          task.taskTitle
        }}</span>
        <time
          :datetime="task.dueDate"
          :title="
            task.dueDate + (task.dueState === 'overdue' ? ' · 已逾期' : '')
          "
          :class="{ overdue: task.dueState === 'overdue' }"
          >{{ task.dueDate.slice(5).replace("-", "/") }}</time
        >
      </div>
      <p v-if="!student.pendingTasks.length" class="empty-copy">
        暂无进行中任务
      </p>
      <p v-if="student.pendingRemaining > 0" class="remaining">
        +{{ student.pendingRemaining }} 项待办
      </p>
    </section>
    <section class="activity-section" aria-label="最新动态">
      <h3>最新动态</h3>
      <div
        v-for="activity in student.activities"
        :key="activity.id"
        class="activity-row"
      >
        <span class="ellipsis" :title="activityText(activity)">{{
          activityText(activity)
        }}</span>
        <time :datetime="activity.occurredAt">{{
          dateFormat.format(new Date(activity.occurredAt))
        }}</time>
      </div>
      <p v-if="!student.activities.length" class="empty-copy">暂无最新动态</p>
    </section>
  </article>
</template>
<style scoped>
.activity-card {
  height: 510px;
  min-height: 510px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  overflow: hidden;
}
.activity-card:focus-visible {
  outline: 3px solid #477657;
  outline-offset: 2px;
}
.student-card-head {
  flex: 0 0 auto;
  padding-bottom: 8px;
}
.student-card-head > div {
  min-width: 0;
  width: 100%;
}
.student-card h2 {
  flex-wrap: nowrap;
}
.student-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.expiry-tag {
  flex-shrink: 0;
}
.grade-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-labels {
  height: 78px;
  flex: 0 0 78px;
  overflow-y: auto;
  overflow-x: hidden;
}
.plan-tags {
  min-width: 0;
}
.plan-tags :deep(.plan-tag) {
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.student-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.student-labels :deep(.ant-tag) {
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
}
h3 {
  margin: 0 0 5px;
  font-size: 12px;
  color: #647269;
}
.pending-section {
  flex: 0 0 132px;
}
.activity-section {
  min-width: 0;
}
.pending-row,
.activity-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 25px;
  font-size: 12px;
}
.check-target {
  flex-shrink: 0;
}
.ellipsis {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
time {
  font-size: 10px;
  color: #7a847e;
  white-space: nowrap;
  flex-shrink: 0;
}
time.overdue {
  color: #b64b48;
}
.empty-copy,
.remaining {
  margin: 4px 0 0;
  color: #8a948e;
  font-size: 12px;
}
@media (max-width: 400px) {
  .activity-card {
    padding: 16px 12px;
  }
}
</style>
