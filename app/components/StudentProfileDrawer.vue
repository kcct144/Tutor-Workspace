<script setup lang="ts">
import { Modal } from "ant-design-vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import {
  studentGrades,
  type StudentDetail,
  type StudentGrade,
} from "../../types/api/students";
const emit = defineEmits<{
  saved: [student: StudentDetail, created: boolean];
}>();
const {
  open,
  loading,
  saving,
  error,
  fieldErrors,
  invalid,
  conflict,
  uncertain,
  ready,
  editingId,
  candidates,
  checkedCount,
  draft,
  dirty,
  begin,
  close,
  save,
  checkUncertain,
} = useStudentProfile((student, created) => emit("saved", student, created));
const confirm = (title: string) =>
  new Promise<boolean>((resolve) =>
    Modal.confirm({
      title,
      okText: "确认",
      cancelText: "保留草稿",
      onOk: () => {
        resolve(true);
      },
      onCancel: () => {
        resolve(false);
      },
    }),
  );
async function leave() {
  if (saving.value) return false;
  if (dirty.value && !(await confirm("放弃未保存的学生档案草稿？")))
    return false;
  close();
  return true;
}
async function reload() {
  if (await confirm("重新加载将替换当前档案草稿，是否继续？"))
    await begin(editingId.value);
}
onBeforeRouteLeave(leave);
onBeforeRouteUpdate(leave);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || saving.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onScopeDispose(() => window.removeEventListener("beforeunload", beforeUnload));
defineExpose({ begin });
</script>
<template>
  <ADrawer
    :open="open"
    :title="editingId ? '编辑档案' : '新增学生'"
    width="min(480px, 100vw)"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    @close="leave"
  >
    <p>仅维护基础档案；负责人和关联信息不在此修改。</p>
    <AAlert v-if="error" type="error" show-icon :message="error" role="alert" />
    <ASpin v-if="loading" aria-label="正在读取档案" />
    <AButton v-if="!ready && !loading" @click="begin(editingId)"
      >重试回填</AButton
    >
    <AForm
      v-if="ready"
      layout="vertical"
      :disabled="saving || loading"
      class="profile-form"
    >
      <AFormItem
        label="姓名"
        required
        :help="fieldErrors.name"
        :validate-status="fieldErrors.name ? 'error' : undefined"
        ><AInput v-model:value="draft.name" aria-label="学生姓名"
      /></AFormItem>
      <AFormItem
        label="年级"
        :help="fieldErrors.grade"
        :validate-status="fieldErrors.grade ? 'error' : undefined"
        ><ASelect
          :value="draft.grade ?? undefined"
          aria-label="学生年级"
          allow-clear
          :options="studentGrades.map((value) => ({ value, label: value }))"
          @update:value="
            (value) =>
              (draft.grade = studentGrades.includes(value as StudentGrade)
                ? (value as StudentGrade)
                : null)
          "
      /></AFormItem>
      <AFormItem
        label="学校"
        :help="fieldErrors.school"
        :validate-status="fieldErrors.school ? 'error' : undefined"
        ><AInput
          :value="draft.school ?? undefined"
          aria-label="学校"
          @update:value="
            (value) =>
              (draft.school = value === undefined ? null : String(value))
          "
      /></AFormItem>
      <AFormItem
        label="班级"
        :help="fieldErrors.className"
        :validate-status="fieldErrors.className ? 'error' : undefined"
        ><AInput
          :value="draft.className ?? undefined"
          aria-label="班级"
          @update:value="
            (value) =>
              (draft.className = value === undefined ? null : String(value))
          "
      /></AFormItem>
      <AFormItem
        label="性别"
        :help="fieldErrors.gender"
        :validate-status="fieldErrors.gender ? 'error' : undefined"
        ><ASelect
          :value="draft.gender ?? undefined"
          aria-label="性别"
          allow-clear
          :options="['男', '女'].map((value) => ({ value, label: value }))"
          @update:value="
            (value) =>
              (draft.gender = value === '男' || value === '女' ? value : null)
          "
      /></AFormItem>
      <AFormItem
        label="入学日期（1900-01-01 至今天）"
        :help="fieldErrors.enrolledAt"
        :validate-status="fieldErrors.enrolledAt ? 'error' : undefined"
        ><AInput
          :value="draft.enrolledAt ?? undefined"
          aria-label="入学日期"
          type="date"
          min="1900-01-01"
          @update:value="
            (value) =>
              (draft.enrolledAt = value === undefined ? null : String(value))
          "
      /></AFormItem>
      <AFormItem
        label="监护人姓名"
        :help="fieldErrors.guardianName"
        :validate-status="fieldErrors.guardianName ? 'error' : undefined"
        ><AInput
          :value="draft.guardianName ?? undefined"
          aria-label="监护人姓名"
          @update:value="
            (value) =>
              (draft.guardianName = value === undefined ? null : String(value))
          "
      /></AFormItem>
      <AFormItem
        label="监护人联系方式"
        :help="fieldErrors.guardianPhone"
        :validate-status="fieldErrors.guardianPhone ? 'error' : undefined"
        ><AInput
          :value="draft.guardianPhone ?? undefined"
          aria-label="监护人联系方式"
          autocomplete="off"
          @update:value="
            (value) =>
              (draft.guardianPhone = value === undefined ? null : String(value))
          "
      /></AFormItem>
      <AFormItem
        label="备注"
        :help="fieldErrors.note"
        :validate-status="fieldErrors.note ? 'error' : undefined"
        ><ATextarea
          :value="draft.note ?? undefined"
          aria-label="备注"
          :rows="3"
          @update:value="
            (value) => (draft.note = value === undefined ? null : String(value))
          "
      /></AFormItem>
    </AForm>
    <section
      v-if="candidates.length"
      class="duplicate-candidates"
      aria-label="可能重复的学生"
    >
      <p>以下最多 5 名学生可能重复，请核对（不是并发防重或幂等保证）。</p>
      <p v-for="item in candidates" :key="item.id">
        {{ item.name }} · {{ item.school }} · {{ item.className }} ·
        {{ item.status }}
      </p>
      <AButton :disabled="saving || loading || invalid" @click="save(true)"
        >仍要创建</AButton
      >
    </section>
    <p v-if="checkedCount !== null">
      同名关键词查询共 {{ checkedCount }} 名，请回列表核对。
    </p>
    <template #footer>
      <ASpace wrap>
        <AButton :disabled="saving" @click="leave">取消</AButton>
        <AButton v-if="conflict" :disabled="loading || saving" @click="reload"
          >重新加载档案</AButton
        >
        <AButton v-if="uncertain" :loading="loading" @click="checkUncertain"
          >刷新核对结果</AButton
        >
        <AButton
          type="primary"
          :loading="saving"
          :disabled="
            !ready ||
            loading ||
            conflict ||
            uncertain ||
            invalid ||
            candidates.length > 0
          "
          @click="save()"
          >保存档案</AButton
        >
      </ASpace>
    </template>
  </ADrawer>
</template>
<style scoped>
.profile-form {
  margin-top: 16px;
}
.duplicate-candidates {
  overflow-wrap: anywhere;
}
.profile-form :deep(input),
.profile-form :deep(textarea) {
  max-width: 100%;
}
</style>
