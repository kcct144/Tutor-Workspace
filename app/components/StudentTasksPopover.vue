<script setup lang="ts">
import { watch } from "vue";
const props = defineProps<{ studentId: string; studentName: string }>();
const open = defineModel<boolean>("open", { default: false });
const { pending, completed, loading, error, refresh } = useStudentTasks(
  () => props.studentId,
);
const completedFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
watch(open, (value) => {
  if (value) void refresh();
});
function shortDue(value: string) {
  return value.slice(5).replace("-", "/");
}
function completedLabel(value: string | null) {
  return value ? completedFormat.format(new Date(value)) : "—";
}
</script>
<template>
  <APopover
    :open="open"
    trigger="hover"
    placement="rightTop"
    :mouse-enter-delay="0.2"
    overlay-class-name="student-tasks-popover"
    @open-change="(value: boolean) => (open = value)"
  >
    <slot />
    <template #content>
      <div class="task-list-panel" :aria-label="studentName + ' 的任务列表'">
        <div v-if="loading" class="task-list-loading">
          <ASpin size="small" /> 正在加载任务…
        </div>
        <AAlert
          v-else-if="error"
          type="error"
          show-icon
          :message="error"
          class="task-list-error"
        >
          <template #action
            ><AButton size="small" @click="refresh">重试</AButton></template
          >
        </AAlert>
        <template v-else>
          <section class="task-list-group">
            <h4>
              待办任务 <span>{{ pending.length }}</span>
            </h4>
            <div
              v-for="task in pending"
              :key="task.id"
              class="task-list-row"
              :class="{ overdue: task.dueState === 'overdue' }"
            >
              <span class="task-list-title" :title="task.taskTitle">{{
                task.taskTitle
              }}</span>
              <span class="task-list-subject">{{ task.subject }}</span>
              <time :datetime="task.dueDate">{{ shortDue(task.dueDate) }}</time>
            </div>
            <p v-if="!pending.length" class="task-list-empty">暂无待办任务</p>
          </section>
          <section class="task-list-group">
            <h4>
              已完成任务 <span>{{ completed.length }}</span>
            </h4>
            <div
              v-for="task in completed"
              :key="task.id"
              class="task-list-row completed"
            >
              <span class="task-list-title done" :title="task.taskTitle">{{
                task.taskTitle
              }}</span>
              <span class="task-list-subject">{{ task.subject }}</span>
              <time :datetime="task.completedAt ?? undefined">{{
                completedLabel(task.completedAt)
              }}</time>
            </div>
            <p v-if="!completed.length" class="task-list-empty">
              暂无已完成任务
            </p>
          </section>
        </template>
      </div>
    </template>
  </APopover>
</template>
<style>
.student-tasks-popover .ant-popover-inner {
  padding: 10px 12px;
}
.task-list-panel {
  width: 330px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-list-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7a857e;
  font-size: 12px;
  padding: 8px 0;
}
.task-list-error .ant-alert-action {
  margin-inline-start: 8px;
}
.task-list-group h4 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #647269;
}
.task-list-group h4 span {
  color: #8a948e;
  font-weight: 400;
}
.task-list-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 24px;
  font-size: 12px;
}
.task-list-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.task-list-title.done {
  color: #8a948e;
  text-decoration: line-through;
}
.task-list-subject {
  flex-shrink: 0;
  max-width: 72px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #7a857e;
}
.task-list-row time {
  flex-shrink: 0;
  font-size: 10px;
  color: #7a847e;
  white-space: nowrap;
}
.task-list-row.overdue time {
  color: #b64b48;
}
.task-list-empty {
  margin: 4px 0 0;
  color: #8a948e;
  font-size: 12px;
}
</style>
