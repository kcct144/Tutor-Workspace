<script setup lang="ts">
import { computed } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { recordCategories } from "../../types/api/learning-records";
import type { Subject } from "../../types/api/subjects";
import { loadSubjectOptions } from "~/services/contracts";
const props = defineProps<{ studentId: string }>();
const {
  items,
  total,
  page,
  pageSize,
  keyword,
  category,
  subject,
  dates,
  loading,
  error,
  success,
  open,
  saving,
  editError,
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
} = useLearningRecords(() => props.studentId);
const options = recordCategories.map((value) => ({ label: value, value }));
const draftSubject = computed<Subject | undefined>({
  get: () => draft.subject ?? undefined,
  set: (value) => (draft.subject = value ?? null),
});
function editById(id: string) {
  const record = items.value.find((item) => item.id === id);
  if (record) begin(record);
}
const columns: TableColumnType[] = [
  { title: "发生日期", dataIndex: "occurredOn", key: "occurredOn", width: 120 },
  { title: "分类", dataIndex: "category", key: "category", width: 65 },
  { title: "科目", dataIndex: "subject", key: "subject", width: 100 },
  { title: "学习记录", dataIndex: "content", key: "content" },
  { title: "记录人", key: "author", width: 100 },
  { title: "操作", key: "action", width: 70 },
];
</script>
<template>
  <section class="detail-section-card">
    <div class="section-heading">
      <div>
        <h2>
          学习记录 <small>{{ total }}</small>
        </h2>
        <p>记录学生的学习表现与跟进情况</p>
      </div>
      <AButton
        type="primary"
        class="primary-green-button"
        :disabled="saving"
        @click="begin()"
        >＋ 新增记录</AButton
      >
    </div>
    <div class="detail-toolbar">
      <AInput
        v-model:value="keyword"
        class="detail-search"
        allow-clear
        :maxlength="64"
        placeholder="搜索记录内容"
      />
      <ASelect
        v-model:value="category"
        class="detail-filter"
        allow-clear
        placeholder="分类：全部"
        aria-label="学习记录分类筛选"
        :options="options"
      />
      <RemoteSelect
        v-model="subject"
        class="detail-filter"
        placeholder="科目：全部"
        aria-label="学习记录科目筛选"
        :loader="loadSubjectOptions"
        :selected-label="subject"
      />
      <ARangePicker
        v-model:value="dates"
        class="record-date-range"
        value-format="YYYY-MM-DD"
        separator="至"
        :placeholder="['开始日期', '结束日期']"
      />
      <AButton @click="resetFilters">重置筛选</AButton>
    </div>
    <AAlert v-if="success" :message="success" type="success" show-icon />
    <AAlert v-if="error" :message="error" type="error" show-icon role="alert"
      ><template #action
        ><AButton @click="refresh">重试</AButton></template
      ></AAlert
    >
    <BaseDataTable
      v-else
      :columns="columns"
      :data-source="items"
      :current="page"
      :total="total"
      :page-size="pageSize"
      :loading="loading"
      empty-text="暂无符合条件的学习记录"
      @change="page = $event.current ?? 1"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'content'" class="record-content">{{
          record.content
        }}</span>
        <ATag v-else-if="column.key === 'category'">{{ record.category }}</ATag>
        <ATag v-else-if="column.key === 'subject'" class="subject-tag">{{
          record.subject ?? "综合/通用"
        }}</ATag>
        <span v-else-if="column.key === 'author'">{{
          record.author.name
        }}</span>
        <AButton
          v-else-if="column.key === 'action'"
          type="link"
          :disabled="saving"
          @click="editById(record.id)"
          >编辑</AButton
        >
      </template>
    </BaseDataTable>
    <AModal
      :open="open"
      :title="editing ? '编辑学习记录' : '新增学习记录'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      :closable="!saving && !reloading"
      :mask-closable="!saving && !reloading"
      :keyboard="!saving && !reloading"
      :cancel-button-props="{ disabled: saving || reloading }"
      :ok-button-props="{ disabled: conflict || reloading }"
      @ok="save"
      @cancel="close"
    >
      <AAlert
        v-if="editError"
        type="error"
        :message="editError"
        show-icon
        role="alert"
      />
      <AButton v-if="conflict" :loading="reloading" @click="reloadEditing"
        >重载最新版本（替换当前草稿）</AButton
      >
      <AForm layout="vertical" :disabled="saving || reloading">
        <AFormItem label="分类" required
          ><ASelect
            v-model:value="draft.category"
            aria-label="记录分类"
            :options="options"
        /></AFormItem>
        <AFormItem label="科目"
          ><RemoteSelect
            v-model="draftSubject"
            placeholder="综合/通用（可不选）"
            aria-label="学习记录科目"
            :loader="loadSubjectOptions"
            :selected-label="draft.subject ?? undefined"
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
            :rows="6"
            placeholder="填写学习记录（1–10000字）"
            aria-label="学习记录正文"
          /><small
            >{{ [...draft.content.trim()].length }} / 10000 字</small
          ></AFormItem
        >
        <p v-if="editing">原记录人：{{ editing.author.name }}（不可修改）</p>
      </AForm>
    </AModal>
  </section>
</template>
<style scoped>
.record-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: block;
  max-height: 240px;
  overflow: auto;
}
</style>
