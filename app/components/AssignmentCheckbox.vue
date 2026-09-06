<script setup lang="ts">
import type { AssignmentStatus } from "../../types/api/task-assignments";
defineProps<{ status: AssignmentStatus; disabled: boolean; label?: string }>();
defineEmits<{ change: [completed: boolean] }>();
</script>
<template>
  <ACheckbox
    :checked="status === 'completed'"
    :disabled="disabled"
    :aria-label="label ?? '切换任务完成状态'"
    @change="$emit('change', Boolean($event.target.checked))"
  />
</template>
