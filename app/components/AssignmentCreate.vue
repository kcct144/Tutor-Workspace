<script setup lang="ts">
import { loadAssignmentTasks } from "~/services/task-assignments";
import { loadStudentOptions } from "~/services/contracts";
const { open, saving, error, notice, form, start, close, save } =
  useAssignmentCreate();
</script>
<template>
  <div>
    <AButton
      type="primary"
      class="primary-green-button"
      :disabled="saving"
      @click="start"
      >＋ 新建分配</AButton
    ><span v-if="notice" role="status">{{ notice }}</span>
    <AModal
      :open="open"
      title="新建任务分配"
      ok-text="创建分配"
      cancel-text="取消"
      :confirm-loading="saving"
      :closable="!saving"
      :mask-closable="!saving"
      :keyboard="!saving"
      :cancel-button-props="{ disabled: saving }"
      @ok="save"
      @cancel="close"
    >
      <div class="record-form task-assignment-form">
        <label
          >任务<RemoteSelect
            v-model="form.taskId"
            :loader="loadAssignmentTasks"
            :disabled="saving"
            placeholder="选择启用中的任务"
            aria-label="分配任务"
        /></label>
        <label
          >学生<RemoteMultiSelect
            v-model="form.studentIds"
            :loader="loadStudentOptions"
            :disabled="saving"
            aria-label="分配学生"
        /></label>
        <label
          >截止时间<ADatePicker
            v-model:value="form.dueDate"
            :disabled="saving"
            value-format="YYYY-MM-DD"
            class="task-assignment-date-picker"
            aria-label="分配截止日期"
        /></label>
        <p v-if="error" role="alert" class="record-form-error">{{ error }}</p>
      </div></AModal
    >
  </div>
</template>
