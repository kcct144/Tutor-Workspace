<script setup lang="ts">
import { computed } from "vue";
import type { TableColumnType } from "ant-design-vue";
import {
  scoreRecordTypeLabels,
  scoreRecordTypes,
  type ScoreRecordType,
} from "../../types/api/score-records";
import { loadStudentOptions, loadSubjectOptions } from "~/services/contracts";

const props = defineProps<{ studentId?: string }>();
const {
  items,
  total,
  page,
  pageSize,
  keyword,
  studentId,
  subject,
  type,
  dates,
  loading,
  error,
  notice,
  open,
  saving,
  formError,
  conflict,
  reloading,
  editing,
  draft,
  refresh,
  resetFilters,
  begin,
  close,
  save,
  reloadEditing,
} = useScoreRecords(() => props.studentId);

const columns = computed<TableColumnType[]>(() => [
  ...(!props.studentId
    ? [{ title: "学生", key: "studentName", width: 150 }]
    : []),
  { title: "日期", key: "examDate", width: 120 },
  { title: "科目", key: "subject", width: 100 },
  { title: "类型", key: "type", width: 82 },
  { title: "考试名称", key: "examName", width: 260 },
  { title: "得分 / 满分", key: "score", width: 125 },
  { title: "更新时间", key: "updatedAt", width: 150 },
  { title: "操作", key: "action", width: 72, fixed: "right" },
]);

const typeOptions = scoreRecordTypes.map((value) => ({
  value,
  label: scoreRecordTypeLabels[value],
}));
function changeType(value: unknown) {
  if (value === "quiz" || value === "exam")
    draft.type = value as ScoreRecordType;
}

function editRecord(value: Record<string, unknown>) {
  const record = items.value.find((item) => item.id === value.id);
  if (record) begin(record);
}
</script>

<template>
  <section :class="props.studentId ? 'detail-section-card' : 'scores-page'">
    <div v-if="props.studentId" class="section-heading score-section-heading">
      <div>
        <h2>
          成绩记录 <small>{{ total }}</small>
        </h2>
      </div>
      <div class="score-heading-actions">
        <AButton
          type="primary"
          class="primary-green-button"
          :disabled="saving"
          @click="begin()"
          >新增成绩</AButton
        >
      </div>
    </div>
    <section v-else class="list-heading">
      <div>
        <p class="eyebrow">SCORE RECORDS</p>
        <h1>
          成绩记录 <span>{{ total }}</span>
        </h1>
      </div>
      <div class="score-heading-actions">
        <AButton type="primary" :disabled="saving" @click="begin()"
          >新增成绩</AButton
        >
      </div>
    </section>

    <section :class="props.studentId ? 'detail-toolbar' : 'scores-toolbar'">
      <AInput
        v-model:value="keyword"
        allow-clear
        :maxlength="64"
        class="score-search"
        :placeholder="props.studentId ? '搜索考试名称' : '搜索学生或考试名称'"
      />
      <RemoteSelect
        v-if="!props.studentId"
        v-model="studentId"
        :loader="loadStudentOptions"
        :selected-label="studentId"
        class="score-student-filter"
        placeholder="全部学生"
      />
      <RemoteSelect
        v-model="subject"
        :loader="loadSubjectOptions"
        :selected-label="subject"
        class="score-filter"
        placeholder="全部科目"
      />
      <ASelect
        v-model:value="type"
        allow-clear
        :options="typeOptions"
        class="score-filter"
        placeholder="全部类型"
      />
      <ARangePicker
        v-model:value="dates"
        value-format="YYYY-MM-DD"
        separator="至"
        :placeholder="['开始日期', '结束日期']"
        class="score-date-filter"
      />
      <AButton class="reset-button" @click="resetFilters">重置</AButton>
    </section>

    <p v-if="notice" class="score-notice" role="status">{{ notice }}</p>
    <AAlert v-if="error" type="error" show-icon :message="error" role="alert">
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <div class="table-panel">
      <BaseDataTable
        :columns="columns"
        :data-source="items.map((item) => ({ ...item }))"
        :loading="loading"
        :current="page"
        :page-size="pageSize"
        :total="total"
        :scroll-x="props.studentId ? 900 : 1040"
        :empty-text="error ? '加载失败，请重试' : '暂无符合条件的成绩记录'"
        @change="page = $event.current ?? 1"
      >
        <template #bodyCell="{ column, record }">
          <NuxtLink
            v-if="column.key === 'studentName'"
            class="student-name-link"
            :to="`/students/${record.studentId}`"
            >{{ record.studentName }}</NuxtLink
          >
          <span v-else-if="column.key === 'examDate'" class="score-date">{{
            record.examDate
          }}</span>
          <span v-else-if="column.key === 'subject'">{{ record.subject }}</span>
          <ATag
            v-else-if="column.key === 'type'"
            class="score-type-tag"
            :class="`score-type-${record.type}`"
            >{{ scoreRecordTypeLabels[record.type as ScoreRecordType] }}</ATag
          >
          <span
            v-else-if="column.key === 'examName'"
            class="score-exam-name"
            :title="record.examName"
            >{{ record.examName }}</span
          >
          <span v-else-if="column.key === 'score'" class="score-value"
            ><strong>{{ record.score }}</strong
            ><span>/ {{ record.fullScore }}</span></span
          >
          <span v-else-if="column.key === 'updatedAt'" class="muted-cell">{{
            record.updatedAt
          }}</span>
          <AButton
            v-else-if="column.key === 'action'"
            type="link"
            class="table-action-button"
            @click="editRecord(record)"
            >编辑</AButton
          >
        </template>
      </BaseDataTable>
    </div>

    <ADrawer
      :open="open"
      :width="480"
      :title="editing ? '编辑成绩' : '新增成绩'"
      :closable="!saving && !reloading"
      :mask-closable="!saving && !reloading"
      :keyboard="!saving && !reloading"
      class="score-drawer"
      @close="close"
    >
      <AAlert
        v-if="formError"
        type="error"
        show-icon
        :message="formError"
        class="score-form-alert"
      />
      <AButton v-if="conflict" :loading="reloading" @click="reloadEditing"
        >重载最新版本（替换当前草稿）</AButton
      >
      <AForm layout="vertical" :disabled="saving || reloading">
        <AFormItem v-if="!props.studentId" label="学生" required>
          <RemoteSelect
            v-model="draft.studentId"
            :loader="loadStudentOptions"
            :selected-label="draft.studentId"
            placeholder="选择学生"
          />
        </AFormItem>
        <AFormItem label="日期" required>
          <ADatePicker
            v-model:value="draft.examDate"
            value-format="YYYY-MM-DD"
            class="score-form-control"
          />
        </AFormItem>
        <div class="score-form-grid">
          <AFormItem label="科目" required>
            <RemoteSelect
              v-model="draft.subject"
              :loader="loadSubjectOptions"
              :selected-label="draft.subject"
              placeholder="选择科目"
            />
          </AFormItem>
          <AFormItem label="类型" required>
            <ASelect
              :value="draft.type"
              :options="typeOptions"
              @change="changeType"
            />
          </AFormItem>
        </div>
        <AFormItem label="考试名称" required>
          <AInput
            v-model:value="draft.examName"
            :maxlength="160"
            placeholder="例如：二次函数随堂小测"
          />
        </AFormItem>
        <AFormItem label="得分 / 满分" required>
          <div class="score-number-row">
            <AInputNumber
              v-model:value="draft.score"
              string-mode
              :min="0"
              :precision="2"
              placeholder="得分"
            />
            <span>/</span>
            <AInputNumber
              v-model:value="draft.fullScore"
              string-mode
              :min="0.01"
              :precision="2"
              placeholder="满分"
            />
          </div>
        </AFormItem>
      </AForm>
      <template #footer>
        <div class="score-drawer-footer">
          <AButton :disabled="saving || reloading" @click="close">取消</AButton>
          <AButton
            type="primary"
            :loading="saving"
            :disabled="conflict || reloading"
            @click="save"
            >保存</AButton
          >
        </div>
      </template>
    </ADrawer>
  </section>
</template>

<style scoped>
.scores-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 42px 36px 60px;
}
.score-heading-actions,
.score-drawer-footer,
.score-number-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.score-section-heading small {
  margin-left: 5px;
  color: #8b958e;
  font-size: 11px;
}
.scores-toolbar,
.detail-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 14px;
}
.score-search {
  width: 200px;
}
.score-student-filter {
  width: 140px;
}
.score-filter {
  width: 105px;
}
.score-date-filter {
  width: 215px;
}
.score-search,
.score-date-filter,
.score-student-filter,
.score-filter {
  min-height: 34px;
}
.score-notice {
  margin: 0 0 10px;
  color: #55785b;
  font-size: 12px;
}
.score-date,
.score-value {
  font-variant-numeric: tabular-nums;
}
.score-type-tag {
  margin: 0;
  border: 0;
  border-radius: 4px;
  font-size: 11px;
}
.score-type-quiz {
  color: #55765b;
  background: #edf5eb;
}
.score-type-exam {
  color: #6f5f96;
  background: #f0ecfa;
}
.score-exam-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.score-value {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}
.score-value strong {
  color: #304b39;
  font-size: 14px;
}
.score-value span {
  color: #8b958e;
}
.score-form-alert {
  margin-bottom: 16px;
}
.score-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.score-form-control,
.score-number-row .ant-input-number {
  width: 100%;
}
.score-number-row > span {
  color: #9ba39d;
}
.score-drawer-footer {
  justify-content: flex-end;
}
@media (max-width: 720px) {
  .scores-page {
    padding: 28px 16px 42px;
  }
  .score-search,
  .score-student-filter,
  .score-filter,
  .score-date-filter {
    width: 100%;
  }
  .score-form-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
