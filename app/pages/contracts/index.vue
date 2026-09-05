<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { getContracts, getContractStatus } from "~/mocks/services/contracts";
import { getStudents } from "~/mocks/services/students";
import type {
  ContractStatus,
  ContractType,
  StudentContract,
} from "~/types/contracts";

type ContractForm = {
  id?: string;
  studentId: string;
  subject: string;
  contractType: ContractType;
  startDate?: string;
  endDate?: string;
  attendedLessons?: number;
  totalLessons?: number;
  makeupLessons: number;
};

const contractTypeLabels: Record<ContractType, string> = {
  month: "月卡",
  half_year: "半年卡",
  year: "年卡",
  lessons: "按课时",
};

function getContractTypeLabel(type: unknown) {
  return typeof type === "string" &&
    Object.prototype.hasOwnProperty.call(contractTypeLabels, type)
    ? contractTypeLabels[type as ContractType]
    : "—";
}

const students = getStudents();
const contracts = ref<StudentContract[]>(getContracts());
const keyword = ref("");
const selectedStudent = ref("全部");
const selectedSubject = ref("全部");
const selectedType = ref<ContractType | "全部">("全部");
const selectedStatus = ref<ContractStatus | "全部">("全部");
const modalOpen = ref(false);
const editingId = ref<string | undefined>();
const formError = ref("");
const form = ref<ContractForm>(createEmptyForm());

const studentNameMap = new Map(
  students.map((student) => [student.id, student.name]),
);
const studentOptions = computed(() => [
  { label: "全部", value: "全部" },
  ...students.map((student) => ({ label: student.name, value: student.id })),
]);
const subjectOptions = computed(() => [
  "全部",
  ...Array.from(new Set(contracts.value.map((contract) => contract.subject))),
]);
const typeOptions = [
  { label: "全部", value: "全部" },
  { label: "月卡", value: "month" },
  { label: "半年卡", value: "half_year" },
  { label: "年卡", value: "year" },
  { label: "按课时", value: "lessons" },
];
const statusOptions = ["全部", "生效中", "未开始", "已到期", "已用完"];

const rows = computed(() =>
  contracts.value.map((contract) => ({
    ...contract,
    studentName: studentNameMap.get(contract.studentId) ?? "未知学生",
    status: getContractStatus(contract),
  })),
);
const filteredContracts = computed(() => {
  const query = keyword.value.trim();
  return rows.value.filter((contract) => {
    const matchesKeyword =
      !query ||
      contract.studentName.includes(query) ||
      contract.subject.includes(query);
    const matchesStudent =
      selectedStudent.value === "全部" ||
      contract.studentId === selectedStudent.value;
    const matchesSubject =
      selectedSubject.value === "全部" ||
      contract.subject === selectedSubject.value;
    const matchesType =
      selectedType.value === "全部" ||
      contract.contractType === selectedType.value;
    const matchesStatus =
      selectedStatus.value === "全部" ||
      contract.status === selectedStatus.value;
    return (
      matchesKeyword &&
      matchesStudent &&
      matchesSubject &&
      matchesType &&
      matchesStatus
    );
  });
});

const columns: TableColumnType[] = [
  { title: "学生", key: "studentName", width: 150 },
  { title: "科目", dataIndex: "subject", key: "subject", width: 120 },
  { title: "合同类型", key: "contractType", width: 120 },
  { title: "开始时间", key: "startDate", width: 130 },
  { title: "到期时间", key: "endDate", width: 130 },
  { title: "已上课时", key: "attendedLessons", width: 100 },
  { title: "总课时", key: "totalLessons", width: 100 },
  { title: "需补课", key: "makeupLessons", width: 90 },
  { title: "状态", key: "status", width: 100 },
  { title: "操作", key: "action", width: 80, fixed: "right" },
];

function createEmptyForm(): ContractForm {
  return {
    studentId: students[0]?.id ?? "",
    subject: "",
    contractType: "month",
    startDate: "2026-09-05",
    endDate: "2026-12-31",
    makeupLessons: 0,
  };
}

function resetFilters() {
  keyword.value = "";
  selectedStudent.value = "全部";
  selectedSubject.value = "全部";
  selectedType.value = "全部";
  selectedStatus.value = "全部";
}

function openCreateModal() {
  editingId.value = undefined;
  form.value = createEmptyForm();
  formError.value = "";
  modalOpen.value = true;
}

function openEditModal(id: string) {
  const contract = contracts.value.find((item) => item.id === id);
  if (!contract) return;
  editingId.value = id;
  form.value = { ...contract };
  formError.value = "";
  modalOpen.value = true;
}

function handleContractTypeChange(value: unknown) {
  if (
    value !== "month" &&
    value !== "half_year" &&
    value !== "year" &&
    value !== "lessons"
  ) {
    return;
  }

  form.value.contractType = value;
  if (value === "lessons") {
    form.value.startDate = undefined;
    form.value.endDate = undefined;
    form.value.attendedLessons = 0;
    form.value.totalLessons = 10;
  } else {
    form.value.startDate = form.value.startDate ?? "2026-09-05";
    form.value.endDate = form.value.endDate ?? "2026-12-31";
    form.value.attendedLessons = undefined;
    form.value.totalLessons = undefined;
  }
}

function validateForm() {
  const current = form.value;
  if (!current.studentId) return "请选择学生";
  if (!current.subject.trim()) return "请填写科目";
  if (current.makeupLessons < 0) return "需补课数不能小于 0";
  if (current.contractType !== "lessons") {
    if (!current.startDate || !current.endDate) {
      return "请选择合同起止日期";
    }
    if (current.endDate < current.startDate) {
      return "结束日期不能早于开始日期";
    }
  } else {
    if (!current.totalLessons || current.totalLessons <= 0) {
      return "请输入大于 0 的总课时";
    }
    if (
      current.attendedLessons === undefined ||
      current.attendedLessons < 0 ||
      current.attendedLessons > current.totalLessons
    ) {
      return "已上课时数需在 0 到总课时数之间";
    }
  }
  return "";
}

function submitForm() {
  formError.value = validateForm();
  if (formError.value) return;

  const nextContract: StudentContract = {
    id: editingId.value ?? `c-${Date.now()}`,
    studentId: form.value.studentId,
    subject: form.value.subject.trim(),
    contractType: form.value.contractType,
    startDate:
      form.value.contractType !== "lessons" ? form.value.startDate : undefined,
    endDate:
      form.value.contractType !== "lessons" ? form.value.endDate : undefined,
    attendedLessons:
      form.value.contractType === "lessons"
        ? form.value.attendedLessons
        : undefined,
    totalLessons:
      form.value.contractType === "lessons"
        ? form.value.totalLessons
        : undefined,
    makeupLessons: form.value.makeupLessons,
  };

  if (editingId.value) {
    const index = contracts.value.findIndex(
      (item) => item.id === editingId.value,
    );
    if (index >= 0) contracts.value[index] = nextContract;
  } else {
    contracts.value.unshift(nextContract);
  }
  modalOpen.value = false;
}
</script>

<template>
  <div class="contracts-page students-page">
    <section class="list-heading">
      <div>
        <p class="eyebrow">CONTRACT DIRECTORY</p>
        <h1>
          合同管理 <span>{{ filteredContracts.length }}</span>
        </h1>
      </div>
      <span class="prototype-note">原型数据 · 仅本次会话有效</span>
    </section>

    <section class="contracts-toolbar students-toolbar">
      <AInput
        v-model:value="keyword"
        class="contract-search student-search"
        allow-clear
        placeholder="搜索学生或科目"
      />
      <label class="student-filter-control">
        <span>学生</span>
        <ASelect
          v-model:value="selectedStudent"
          class="contract-filter student-filter"
          aria-label="按学生筛选"
          :options="studentOptions"
        />
      </label>
      <label class="student-filter-control">
        <span>科目</span>
        <ASelect
          v-model:value="selectedSubject"
          class="contract-filter student-filter"
          aria-label="按科目筛选"
          :options="subjectOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <label class="student-filter-control">
        <span>类型</span>
        <ASelect
          v-model:value="selectedType"
          class="contract-filter student-filter"
          aria-label="按合同类型筛选"
          :options="typeOptions"
        />
      </label>
      <label class="student-filter-control">
        <span>状态</span>
        <ASelect
          v-model:value="selectedStatus"
          class="contract-filter student-filter"
          aria-label="按合同状态筛选"
          :options="statusOptions.map((value) => ({ label: value, value }))"
        />
      </label>
      <AButton class="reset-button" @click="resetFilters">重置筛选</AButton>
      <AButton
        type="primary"
        class="primary-green-button"
        @click="openCreateModal"
      >
        ＋ 新增合同
      </AButton>
    </section>

    <section class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="filteredContracts"
        empty-text="暂无符合条件的合同"
      >
        <template #bodyCell="{ column, record }">
          <NuxtLink
            v-if="column.key === 'studentName'"
            class="student-name-link"
            :to="`/students/${record.studentId}`"
          >
            {{ record.studentName }}
          </NuxtLink>
          <ATag v-else-if="column.key === 'subject'" class="subject-tag">
            {{ record.subject }}
          </ATag>
          <span v-else-if="column.key === 'contractType'" class="muted-cell">
            {{ getContractTypeLabel(record.contractType) }}
          </span>
          <span
            v-else-if="column.key === 'startDate'"
            class="contract-date-cell"
          >
            {{ record.startDate ?? "—" }}
          </span>
          <span v-else-if="column.key === 'endDate'" class="contract-date-cell">
            {{ record.endDate ?? "—" }}
          </span>
          <span
            v-else-if="column.key === 'attendedLessons'"
            class="contract-date-cell"
          >
            {{
              record.contractType === "lessons"
                ? (record.attendedLessons ?? 0)
                : "—"
            }}
          </span>
          <span
            v-else-if="column.key === 'totalLessons'"
            class="contract-date-cell"
          >
            {{
              record.contractType === "lessons"
                ? (record.totalLessons ?? 0)
                : "—"
            }}
          </span>
          <span
            v-else-if="column.key === 'makeupLessons'"
            class="contract-date-cell"
          >
            {{ record.makeupLessons }}
          </span>
          <ATag
            v-else-if="column.key === 'status'"
            class="contract-status-tag"
            :class="`contract-status-${record.status}`"
          >
            {{ record.status }}
          </ATag>
          <AButton
            v-else-if="column.key === 'action'"
            type="link"
            class="table-action-button"
            @click="openEditModal(record.id)"
          >
            编辑
          </AButton>
        </template>
      </BaseDataTable>
    </section>

    <a-modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑合同' : '新增合同'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitForm"
    >
      <div class="record-form contract-form">
        <label>
          学生
          <ASelect
            v-model:value="form.studentId"
            :options="studentOptions.filter((item) => item.value !== '全部')"
          />
        </label>
        <label>
          科目
          <AInput v-model:value="form.subject" placeholder="例如：数学" />
        </label>
        <label>
          合同类型
          <ASelect
            v-model:value="form.contractType"
            :options="typeOptions.slice(1)"
            @change="handleContractTypeChange"
          />
        </label>
        <template v-if="form.contractType !== 'lessons'">
          <label>
            开始日期
            <ADatePicker
              v-model:value="form.startDate"
              value-format="YYYY-MM-DD"
              class="contract-date-picker"
            />
          </label>
          <label>
            结束日期
            <ADatePicker
              v-model:value="form.endDate"
              value-format="YYYY-MM-DD"
              class="contract-date-picker"
            />
          </label>
        </template>
        <template v-else>
          <label>
            已上课时数
            <AInputNumber
              v-model:value="form.attendedLessons"
              :min="0"
              class="contract-number-input"
            />
          </label>
          <label>
            总课时数
            <AInputNumber
              v-model:value="form.totalLessons"
              :min="1"
              class="contract-number-input"
            />
          </label>
        </template>
        <label>
          需补课数
          <AInputNumber
            v-model:value="form.makeupLessons"
            :min="0"
            class="contract-number-input"
          />
        </label>
        <span v-if="formError" class="record-form-error">{{ formError }}</span>
      </div>
    </a-modal>
  </div>
</template>
