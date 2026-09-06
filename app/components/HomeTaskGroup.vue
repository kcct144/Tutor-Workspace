<script setup lang="ts">
import type { TaskAssignment } from "../../types/api/task-assignments";
defineProps<{
  title: string;
  tasks: TaskAssignment[];
  remaining: number;
  completed: boolean;
  pendingIds: string[];
}>();
defineEmits<{ change: [id: string, completed: boolean] }>();
</script>
<template>
  <div v-if="tasks.length" class="task-group">
    <span class="task-group-title">{{ title }}</span>
    <div class="task-list">
      <label
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ done: completed }"
        :title="task.subject + ' · ' + task.description"
      >
        <AssignmentCheckbox
          :status="task.status"
          :disabled="pendingIds.includes(task.id)"
          :label="'切换 ' + task.taskTitle + ' 完成状态'"
          @change="(value) => $emit('change', task.id, value)"
        /><span
          >{{ task.taskTitle
          }}<small v-if="task.dueState === 'overdue'"> · 已逾期</small></span
        > </label
      ><span v-if="remaining > 0" class="more-tasks"
        >+{{ remaining }} 条{{ title }}任务</span
      >
    </div>
  </div>
</template>
