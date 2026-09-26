<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { recordCategories } from "../../types/api/learning-records";
import type { LearningRecord } from "../../types/api/learning-records";
import { createRecord } from "~/services/learning-records";
import { loadSubjectOptions } from "~/services/contracts";
import { ServiceError } from "~/services/http";
import { notifyStudentChange } from "~/composables/useStudentInvalidation";

const props = defineProps<{ student: { id: string; name: string } | null }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [record: LearningRecord] }>();
const options = recordCategories.map((value) => ({ label: value, value }));
const saving = ref(false);
const error = ref("");
const draft = reactive<{
  category: (typeof recordCategories)[number];
  subject: string;
  occurredOn: string;
  content: string;
}>({ category: "缺", subject: "英语", occurredOn: "", content: "" });
const subject = computed<string | undefined>({
  get: () => draft.subject || undefined,
  set: (value) => (draft.subject = value ?? ""),
});
function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (kind: string) =>
    parts.find((part) => part.type === kind)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function reset() {
  draft.category = "缺";
  draft.subject = "英语";
  draft.occurredOn = shanghaiToday();
  draft.content = "";
  error.value = "";
}
watch(open, (value) => {
  if (value) reset();
});
async function save() {
  if (saving.value || !props.student) return;
  const content = draft.content.trim();
  if (!draft.occurredOn) {
    error.value = "请选择发生日期。";
    return;
  }
  if (!content || [...content].length > 10000) {
    error.value = "请填写1–10000字正文。";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const record = await createRecord({
      studentId: props.student.id,
      category: draft.category,
      subject: draft.subject.trim() ? draft.subject.trim() : null,
      content,
      occurredOn: draft.occurredOn,
    });
    notifyStudentChange();
    open.value = false;
    emit("saved", record);
  } catch (cause) {
    error.value =
      cause instanceof ServiceError ? cause.message : "保存失败，请重试。";
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <AModal
    :open="open"
    :title="student ? '快速添加学习记录 · ' + student.name : '快速添加学习记录'"
    ok-text="保存"
    cancel-text="取消"
    :confirm-loading="saving"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    :cancel-button-props="{ disabled: saving }"
    @ok="save"
    @cancel="open = false"
  >
    <AAlert v-if="error" type="error" :message="error" show-icon role="alert" />
    <AForm layout="vertical" :disabled="saving">
      <AFormItem label="分类" required
        ><ASelect
          v-model:value="draft.category"
          aria-label="记录分类"
          :options="options"
      /></AFormItem>
      <AFormItem label="科目"
        ><RemoteSelect
          v-model="subject"
          placeholder="综合/通用（可不选）"
          aria-label="学习记录科目"
          :loader="loadSubjectOptions"
          :selected-label="draft.subject || undefined"
      /></AFormItem>
      <AFormItem label="发生日期" required
        ><ADatePicker
          v-model:value="draft.occurredOn"
          value-format="YYYY-MM-DD"
          placeholder="选择发生日期"
          aria-label="发生日期"
      /></AFormItem>
      <AFormItem label="正文" required
        ><ATextarea
          v-model:value="draft.content"
          :rows="5"
          placeholder="填写学习记录（1–10000字）"
          aria-label="学习记录正文"
        /><small
          >{{ [...draft.content.trim()].length }} / 10000 字</small
        ></AFormItem
      >
    </AForm>
  </AModal>
</template>
