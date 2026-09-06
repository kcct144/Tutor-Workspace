<script setup lang="ts">
import type { TableColumnType } from "ant-design-vue";
import {
  contractTypes,
  contractLabels,
  contractStatuses,
} from "../../../types/api/contracts";
import { loadStudentOptions, loadSubjectOptions } from "~/services/contracts";
const {
  query,
  items,
  total,
  loading,
  error,
  refresh,
  reset,
  modalOpen,
  editing,
  detailLoading,
  detailFailed,
  isEditing,
  formError,
  saving,
  conflict,
  notice,
  openCreate,
  openEdit,
  close,
  save,
  reloadDetail,
} = useContracts();
const columns: TableColumnType[] = [
  {
    title: "合同编号",
    dataIndex: "contractNo",
    key: "contractNo",
    width: 210,
    ellipsis: true,
  },
  { title: "学生", key: "studentName", width: 150 },
  { title: "科目", dataIndex: "subject", key: "subject", width: 120 },
  { title: "合同类型", key: "contractType", width: 100 },
  { title: "开始时间", dataIndex: "startDate", key: "startDate", width: 130 },
  { title: "到期时间", dataIndex: "endDate", key: "endDate", width: 130 },
  {
    title: "已上课时",
    dataIndex: "attendedLessons",
    key: "attendedLessons",
    width: 100,
  },
  {
    title: "总课时",
    dataIndex: "totalLessons",
    key: "totalLessons",
    width: 100,
  },
  {
    title: "需补课",
    dataIndex: "makeupLessons",
    key: "makeupLessons",
    width: 90,
  },
  { title: "状态", key: "status", width: 100 },
  { title: "操作", key: "action", width: 80, fixed: "right" },
];
function typeLabel(type: unknown) {
  return contractLabels[type as keyof typeof contractLabels] ?? "—";
}
</script>

<template>
  <div class="contracts-page students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">CONTRACT DIRECTORY</p>
        <h1>
          合同管理 <span>{{ total }}</span>
        </h1>
      </div>
      <span class="prototype-note">S2 · 真实合同与学生聚合</span>
    </section>
    <section class="contracts-toolbar students-toolbar">
      <AInput
        v-model:value="query.keyword"
        class="contract-search student-search"
        allow-clear
        :maxlength="64"
        placeholder="搜索编号、学生或科目"
      />
      <label class="student-filter-control"
        ><span>学生</span
        ><RemoteSelect
          v-model="query.studentId"
          :loader="loadStudentOptions"
          class="contract-filter student-filter"
          aria-label="按学生筛选"
      /></label>
      <label class="student-filter-control"
        ><span>科目</span
        ><RemoteSelect
          v-model="query.subject"
          :loader="loadSubjectOptions"
          class="contract-filter student-filter"
          aria-label="按科目筛选"
      /></label>
      <label class="student-filter-control"
        ><span>类型</span
        ><ASelect
          v-model:value="query.contractType"
          allow-clear
          placeholder="全部"
          class="contract-filter student-filter"
          aria-label="按合同类型筛选"
          :options="
            contractTypes.map((value) => ({
              value,
              label: contractLabels[value],
            }))
          "
      /></label>
      <label class="student-filter-control"
        ><span>状态</span
        ><ASelect
          v-model:value="query.status"
          allow-clear
          placeholder="全部"
          class="contract-filter student-filter"
          aria-label="按合同状态筛选"
          :options="contractStatuses.map((value) => ({ value, label: value }))"
      /></label>
      <AButton class="reset-button" @click="reset">重置筛选</AButton>
      <AButton type="primary" class="primary-green-button" @click="openCreate"
        >＋ 新增合同</AButton
      >
    </section>
    <AAlert v-if="notice" :message="notice" type="success" show-icon />
    <AAlert v-if="error" :message="error" type="error" show-icon role="alert"
      ><template #action
        ><AButton :loading="loading" @click="refresh">重试</AButton></template
      ></AAlert
    >
    <section v-else class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="items"
        :current="query.page"
        :page-size="8"
        :total="total"
        :loading="loading"
        :scroll-x="1410"
        empty-text="暂无符合条件的合同"
        @change="(pagination) => (query.page = pagination.current ?? 1)"
      >
        <template #bodyCell="{ column, record }">
          <NuxtLink
            v-if="column.key === 'studentName'"
            class="student-name-link"
            :to="`/students/${record.studentId}`"
            >{{ record.studentName }}</NuxtLink
          >
          <ATag v-else-if="column.key === 'subject'" class="subject-tag">{{
            record.subject
          }}</ATag>
          <span v-else-if="column.key === 'contractType'" class="muted-cell">{{
            typeLabel(record.contractType)
          }}</span>
          <span
            v-else-if="
              [
                'startDate',
                'endDate',
                'attendedLessons',
                'totalLessons',
              ].includes(String(column.key))
            "
            class="contract-date-cell"
            >{{ record[String(column.key)] ?? "—" }}</span
          >
          <ATag
            v-else-if="column.key === 'status'"
            class="contract-status-tag"
            :class="`contract-status-${record.status}`"
            >{{ record.status }}</ATag
          >
          <AButton
            v-else-if="column.key === 'action'"
            type="link"
            class="table-action-button"
            @click="openEdit(record.id)"
            >编辑</AButton
          >
        </template>
      </BaseDataTable>
    </section>
    <ContractEditor
      :open="modalOpen"
      :contract="editing"
      :is-editing="isEditing"
      :detail-failed="detailFailed"
      :loading="detailLoading"
      :saving="saving"
      :error="formError"
      :conflict="conflict"
      @close="close"
      @save="save"
      @reload="reloadDetail"
    />
  </div>
</template>
