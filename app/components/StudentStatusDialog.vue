<script setup lang="ts">
import { Modal, message } from "ant-design-vue";
import { studentStatuses } from "../../types/api/students";
const {
  open,
  saving,
  loading,
  error,
  info,
  blocked,
  source,
  target,
  notice,
  begin,
  reload,
  save,
} = useStudentStatus();
watch(notice, (value) => {
  if (value) message.success(value);
});
async function confirmSave() {
  if (saving.value || loading.value || blocked.value) return;
  if (
    target.value !== source.value?.status &&
    (target.value === "已结课" ||
      (source.value?.status === "已结课" && target.value === "在读"))
  ) {
    Modal.confirm({
      title: "再次确认学生状态变更",
      content: "结课或恢复在读不会删除、解除或修改合同、学习记录、计划及任务。",
      okText: "确认变更",
      cancelText: "取消",
      onOk: save,
    });
  } else await save();
}
defineExpose({ begin });
</script>
<template>
  <AModal
    :open="open"
    title="变更学生状态"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: blocked || loading }"
    :cancel-button-props="{ disabled: saving }"
    ok-text="保存状态"
    cancel-text="取消"
    @ok="confirmSave"
    @cancel="open = false"
  >
    <p>当前状态：{{ source?.status }}</p>
    <p>状态变化不会删除、解除或迁移合同、学习记录、学习计划和任务分配。</p>
    <ASelect
      v-model:value="target"
      aria-label="目标学生状态"
      style="width: 100%"
      :disabled="saving || loading"
      :options="studentStatuses.map((value) => ({ value, label: value }))"
    />
    <AAlert v-if="error" type="error" :message="error" show-icon />
    <AAlert v-if="info" type="info" :message="info" show-icon />
    <AButton v-if="blocked" :loading="loading" @click="reload"
      >重新读取最新状态</AButton
    >
  </AModal>
</template>
