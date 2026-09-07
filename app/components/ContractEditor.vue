<script setup lang="ts">
import { ref, watch } from "vue";
import {
  contractLabels,
  contractTypes,
  type Contract,
  type ContractWrite,
  type ContractType,
} from "../../types/api/contracts";
import { loadStudentOptions } from "~/services/contracts";
const props = defineProps<{
  open: boolean;
  contract: Contract | null;
  loading: boolean;
  saving: boolean;
  error: string;
  conflict: boolean;
  detailFailed: boolean;
  isEditing: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [input: ContractWrite];
  reload: [];
}>();
function empty(): ContractWrite {
  return {
    studentId: "",
    subject: "",
    contractType: "month",
    startDate: null,
    endDate: null,
    attendedLessons: null,
    totalLessons: null,
    makeupLessons: 0,
  };
}
const form = ref(empty());
watch(
  () => [props.open, props.contract],
  () => {
    if (!props.open) return;
    const c = props.contract;
    form.value = c
      ? {
          studentId: c.studentId,
          subject: c.subject,
          contractType: c.contractType,
          startDate: c.startDate,
          endDate: c.endDate,
          attendedLessons: c.attendedLessons,
          totalLessons: c.totalLessons,
          makeupLessons: c.makeupLessons,
        }
      : empty();
  },
  { immediate: true },
);
function typeChanged(value: unknown) {
  if (!contractTypes.includes(value as ContractType)) return;
  if (value === "trial") {
    form.value.startDate = null;
    form.value.endDate = null;
    form.value.attendedLessons = null;
    form.value.totalLessons = null;
    form.value.makeupLessons = 0;
  } else if (value === "lessons") {
    form.value.startDate = null;
    form.value.endDate = null;
    form.value.attendedLessons = 0;
    form.value.totalLessons = 1;
  } else {
    form.value.attendedLessons = null;
    form.value.totalLessons = null;
  }
}
</script>
<template>
  <AModal
    :open="open"
    :title="isEditing ? '编辑合同' : '新增合同'"
    ok-text="保存"
    cancel-text="取消"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: loading || conflict || detailFailed }"
    :cancel-button-props="{ disabled: saving }"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    @cancel="emit('close')"
    @ok="emit('save', { ...form })"
  >
    <ASkeleton v-if="loading" active />
    <fieldset
      v-else
      class="record-form contract-form"
      :disabled="saving"
      style="border: 0; padding: 0"
    >
      <label
        >合同编号<AInput
          :value="contract?.contractNo ?? '保存后由服务端生成'"
          readonly
      /></label>
      <label
        >学生<RemoteSelect
          v-model="form.studentId"
          :loader="loadStudentOptions"
          :selected-label="contract?.studentName"
          :disabled="saving"
          placeholder="搜索并选择学生"
      /></label>
      <label
        >科目<AInput
          v-model:value="form.subject"
          :maxlength="64"
          :disabled="saving"
          placeholder="例如：数学"
      /></label>
      <label
        >合同类型<ASelect
          v-model:value="form.contractType"
          :disabled="saving"
          :options="
            contractTypes
              .filter(
                (value) =>
                  !isEditing ||
                  (contract?.contractType === 'trial') === (value === 'trial'),
              )
              .map((value) => ({
                value,
                label: contractLabels[value],
              }))
          "
          @change="typeChanged"
      /></label>
      <AAlert
        v-if="form.contractType === 'trial'"
        message="体验合同一次性生效，不填写日期、课时或补课数；终止后不再参与学生科目聚合。"
        type="info"
        show-icon
      />
      <template v-else-if="form.contractType !== 'lessons'">
        <label
          >开始日期<ADatePicker
            :value="form.startDate ?? undefined"
            value-format="YYYY-MM-DD"
            :disabled="saving"
            class="contract-date-picker"
            @update:value="
              (value) =>
                (form.startDate = typeof value === 'string' ? value : null)
            "
        /></label>
        <label
          >结束日期<ADatePicker
            :value="form.endDate ?? undefined"
            value-format="YYYY-MM-DD"
            :disabled="saving"
            class="contract-date-picker"
            @update:value="
              (value) =>
                (form.endDate = typeof value === 'string' ? value : null)
            "
        /></label>
      </template>
      <template v-else>
        <label
          >已上课时数<AInputNumber
            :value="form.attendedLessons ?? undefined"
            :min="0"
            :max="4294967295"
            :precision="0"
            :disabled="saving"
            class="contract-number-input"
            @update:value="
              (value) =>
                (form.attendedLessons =
                  typeof value === 'number' ? value : null)
            "
        /></label>
        <label
          >总课时数<AInputNumber
            :value="form.totalLessons ?? undefined"
            :min="1"
            :max="4294967295"
            :precision="0"
            :disabled="saving"
            class="contract-number-input"
            @update:value="
              (value) =>
                (form.totalLessons = typeof value === 'number' ? value : null)
            "
        /></label>
      </template>
      <label v-if="form.contractType !== 'trial'"
        >需补课数<AInputNumber
          v-model:value="form.makeupLessons"
          :min="0"
          :max="4294967295"
          :precision="0"
          :disabled="saving"
          class="contract-number-input"
      /></label>
    </fieldset>
    <AAlert v-if="error" :message="error" type="error" show-icon role="alert" />
    <AButton
      v-if="error && isEditing"
      :disabled="saving || loading"
      @click="emit('reload')"
      >重新载入（替换草稿）</AButton
    >
  </AModal>
</template>
