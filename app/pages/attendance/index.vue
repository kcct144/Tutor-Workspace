<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { TableColumnType } from "ant-design-vue";
import { studentGrades, studentStatuses } from "../../../types/api/students";
import {
  attendanceStatuses,
  attendancePeriods,
  attendancePeriodLabels,
  type AttendancePeriod,
  attendanceStatusLabels,
  attendanceStatusSymbols,
  type AttendanceStatus,
} from "../../../types/api/attendance";

const {
  month,
  keyword,
  grade,
  gender,
  status,
  selectedPeriod,
  total,
  dates,
  rows,
  recordMap,
  loading,
  error,
  todaySummary,
  todaySummaryDate,
  savingKeys,
  savedKeys,
  cellErrors,
  cellDrafts,
  refresh,
  resetFilters,
  changeStatus,
  clearAttendance,
  cellKey,
} = useAttendance();

const clearScheduledValue = "__clear_scheduled__";
const statusOptions = attendanceStatuses.map((value) => ({
  value,
  label: attendanceStatusLabels[value],
  symbol: attendanceStatusSymbols[value],
}));
const clearScheduledOption = {
  value: clearScheduledValue,
  label: "取消排课（恢复无课）",
  symbol: "—",
};
const dateMap = computed(
  () => new Map(dates.value.map((date) => [date.iso, date])),
);
const activeCellKey = ref<string>();
let activeTrigger: HTMLButtonElement | undefined;
const attendanceTable = ref<{ $el?: HTMLElement } | null>(null);
const autoPositionedMonth = ref("");

function focusEditor(instance: unknown) {
  const editor = instance as { focus?: () => void } | null;
  if (editor)
    void nextTick(() => {
      if (activeCellKey.value) editor.focus?.();
    });
}

function openCell(key: string, event: MouseEvent) {
  activeTrigger = event.currentTarget as HTMLButtonElement;
  activeCellKey.value = key;
}

function closeCell() {
  activeCellKey.value = undefined;
}

async function finishCell() {
  const triggerId = activeTrigger?.id;
  closeCell();
  await nextTick();
  if (triggerId)
    document.getElementById(triggerId)?.focus({ preventScroll: true });
}
const periodOptions = [
  { value: "all", label: "全部时段" },
  ...attendancePeriods.map((value) => ({
    value,
    label: attendancePeriodLabels[value],
  })),
];
const visiblePeriods = computed(() =>
  selectedPeriod.value === "all" ? attendancePeriods : [selectedPeriod.value],
);
const todaySummaryLabel = computed(() =>
  selectedPeriod.value === "all"
    ? "今日全部时段（按人次）"
    : `今日${attendancePeriodLabels[selectedPeriod.value]}`,
);
const dateColumnWidth = computed(() =>
  selectedPeriod.value === "all" ? 72 : 48,
);

function shanghaiIsoDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function positionYesterdayFirst() {
  if (loading.value || autoPositionedMonth.value === month.value) return;
  autoPositionedMonth.value = month.value;

  const yesterday = new Date(`${shanghaiIsoDate()}T12:00:00+08:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  const index = dates.value.findIndex((date) => date.iso === yesterdayIso);
  if (index < 0) return;

  void nextTick(() => {
    const scrollArea =
      attendanceTable.value?.$el?.querySelector<HTMLElement>(
        ".ant-table-content",
      );
    if (scrollArea) scrollArea.scrollLeft = index * dateColumnWidth.value;
  });
}
watch(selectedPeriod, () => {
  autoPositionedMonth.value = "";
  positionYesterdayFirst();
});
watch([loading, month], () => positionYesterdayFirst(), { flush: "post" });
watch(
  [selectedPeriod, month, keyword, grade, gender, status, loading],
  closeCell,
);

function resetView() {
  resetFilters();
  selectedPeriod.value = "morning";
}
const gradeOptions = studentGrades.map((value) => ({ value, label: value }));
const genderOptions = [
  { value: "男", label: "男" },
  { value: "女", label: "女" },
];
const studentStatusOptions = studentStatuses.map((value) => ({
  value,
  label: value,
}));

const columns = computed<TableColumnType[]>(() => [
  {
    title: "学生姓名",
    key: "student",
    dataIndex: "student",
    fixed: "left",
    width: 82,
  },
  ...dates.value.map((date) => ({
    title: `${date.day}日 周${date.weekday}`,
    key: date.iso,
    dataIndex: date.iso,
    width: dateColumnWidth.value,
    className: [
      date.weekend ? "attendance-weekend-column" : "",
      date.today ? "attendance-today-column" : "",
    ]
      .filter(Boolean)
      .join(" "),
  })),
]);

const scrollWidth = computed(
  () => 82 + dates.value.length * dateColumnWidth.value,
);

function cellStatus(studentId: string, date: string, period: AttendancePeriod) {
  return recordMap.value.get(cellKey(studentId, date, period))?.status;
}

function cellTitle(key: string, fallback: string) {
  const error = cellErrors.value.get(key);
  if (error) return error;
  const draft = cellDrafts.value.get(key);
  return draft
    ? `未保存选择：${attendanceStatusLabels[draft]}；${fallback}`
    : fallback;
}

function selectStatus(
  studentId: string,
  date: string,
  period: AttendancePeriod,
  value: unknown,
) {
  void finishCell();
  if (value === clearScheduledValue) {
    void clearAttendance(studentId, date, period);
    return;
  }
  if (attendanceStatuses.includes(value as AttendanceStatus))
    void changeStatus(studentId, date, period, value as AttendanceStatus);
}

function cellOptions(
  _studentId: string,
  _date: string,
  _period: AttendancePeriod,
) {
  return [...statusOptions, clearScheduledOption];
}
</script>

<template>
  <div class="attendance-page">
    <section class="list-heading attendance-heading">
      <div>
        <p class="eyebrow">ATTENDANCE</p>
        <h1>
          出勤管理 <span>{{ total }}</span>
        </h1>
      </div>
    </section>

    <section class="attendance-toolbar">
      <AInput
        v-model:value="keyword"
        allow-clear
        :maxlength="64"
        class="attendance-search"
        placeholder="搜索学生姓名"
      />
      <ASelect
        v-model:value="grade"
        allow-clear
        :options="gradeOptions"
        class="attendance-filter"
        placeholder="全部年级"
      />
      <ASelect
        v-model:value="gender"
        allow-clear
        :options="genderOptions"
        class="attendance-filter attendance-gender-filter"
        placeholder="全部性别"
      />
      <ASelect
        v-model:value="status"
        :options="studentStatusOptions"
        class="attendance-filter"
        aria-label="学生状态"
      />
      <ADatePicker
        v-model:value="month"
        picker="month"
        value-format="YYYY-MM"
        format="YYYY年MM月"
        :allow-clear="false"
        class="attendance-month-picker"
      />
      <ASelect
        v-model:value="selectedPeriod"
        :options="periodOptions"
        class="attendance-filter"
        aria-label="上课时段"
      />
      <AButton class="reset-button" @click="resetView">重置</AButton>
    </section>

    <section class="attendance-legend" aria-label="出勤状态图例">
      <span
        v-for="attendanceStatus in attendanceStatuses"
        :key="attendanceStatus"
        class="legend-item"
      >
        <i :class="`legend-${attendanceStatus}`">{{
          attendanceStatusSymbols[attendanceStatus]
        }}</i
        >{{ attendanceStatusLabels[attendanceStatus] }}
      </span>
      <span class="legend-item"><i class="legend-empty">—</i>未记录</span>
      <span class="legend-tip">周末仅作日期提示，不代表应到或休息</span>
    </section>

    <section
      v-if="todaySummaryDate"
      class="attendance-summary"
      aria-live="polite"
    >
      <span class="attendance-summary-title">{{ todaySummaryLabel }}</span>
      <span
        v-for="item in attendanceStatuses"
        :key="item"
        class="attendance-summary-item"
        :class="`attendance-summary-${item}`"
      >
        <i>{{ attendanceStatusSymbols[item] }}</i>
        {{ attendanceStatusLabels[item] }} {{ todaySummary[item] }}
      </span>
    </section>
    <section v-else class="attendance-summary attendance-summary-empty">
      所选月份不含今天，暂不显示今日统计
    </section>

    <AAlert
      v-if="error"
      type="error"
      show-icon
      :message="error"
      class="attendance-error"
      role="alert"
    >
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>

    <section class="attendance-matrix-panel">
      <ATable
        ref="attendanceTable"
        :columns="columns"
        :data-source="rows"
        :row-key="(row: { key: string }) => row.key"
        :loading="loading"
        :scroll="{ x: scrollWidth }"
        :pagination="false"
        :locale="{
          emptyText: error ? '加载失败，请重试' : '暂无符合条件的学生',
        }"
        size="middle"
        class="attendance-table"
      >
        <template #headerCell="{ column }">
          <div
            v-if="column.key !== 'student'"
            class="attendance-date-head"
            :class="{
              weekend: dateMap.get(String(column.key))?.weekend,
              today: dateMap.get(String(column.key))?.today,
            }"
          >
            <strong>{{ String(column.title).split(" ")[0] }}</strong>
            <span>{{ String(column.title).split(" ")[1] }}</span>
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <NuxtLink
            v-if="column.key === 'student'"
            :to="`/students/${record.student.id}`"
            :title="record.student.name"
            class="attendance-student-name"
          >
            {{ record.student.name }}
          </NuxtLink>
          <div v-else class="attendance-day">
            <div
              v-for="period in visiblePeriods"
              :key="cellKey(record.student.id, String(column.key), period)"
              class="attendance-period-row"
            >
              <span
                v-if="selectedPeriod === 'all'"
                class="attendance-period-label"
                >{{ attendancePeriodLabels[period] }}</span
              >
              <div
                class="attendance-cell"
                :class="{
                  saved: savedKeys.has(
                    cellKey(record.student.id, String(column.key), period),
                  ),
                  failed: cellErrors.has(
                    cellKey(record.student.id, String(column.key), period),
                  ),
                }"
              >
                <ASpin
                  v-if="
                    savingKeys.has(
                      cellKey(record.student.id, String(column.key), period),
                    )
                  "
                  size="small"
                />
                <ASelect
                  v-else-if="
                    activeCellKey ===
                    cellKey(record.student.id, String(column.key), period)
                  "
                  :ref="focusEditor"
                  :auto-focus="true"
                  :default-open="true"
                  :value="
                    cellStatus(record.student.id, String(column.key), period)
                  "
                  :options="
                    cellOptions(record.student.id, String(column.key), period)
                  "
                  option-label-prop="symbol"
                  placeholder="—"
                  size="small"
                  class="attendance-cell-select"
                  :class="`attendance-${cellStatus(record.student.id, String(column.key), period) ?? 'empty'}`"
                  :dropdown-match-select-width="false"
                  :aria-label="`${record.student.name} · ${column.key} · ${attendancePeriodLabels[period]}`"
                  :title="
                    cellTitle(
                      cellKey(record.student.id, String(column.key), period),
                      `${record.student.name} · ${column.key} · ${attendancePeriodLabels[period]}`,
                    )
                  "
                  @blur="closeCell"
                  @keydown.esc.stop.prevent="finishCell"
                  @dropdown-visible-change="
                    (open: boolean) => {
                      if (!open) void finishCell();
                    }
                  "
                  @change="
                    selectStatus(
                      record.student.id,
                      String(column.key),
                      period,
                      $event,
                    )
                  "
                />
                <button
                  v-else
                  :id="`attendance-trigger-${cellKey(record.student.id, String(column.key), period)}`"
                  type="button"
                  class="attendance-cell-button"
                  :class="`attendance-${cellStatus(record.student.id, String(column.key), period) ?? 'empty'}`"
                  aria-haspopup="listbox"
                  :aria-label="`${record.student.name} · ${column.key} · ${attendancePeriodLabels[period]} · ${attendanceStatusLabels[cellStatus(record.student.id, String(column.key), period)!] ?? '未记录'}`"
                  :title="
                    cellTitle(
                      cellKey(record.student.id, String(column.key), period),
                      '点击修改状态',
                    )
                  "
                  @click="
                    openCell(
                      cellKey(record.student.id, String(column.key), period),
                      $event,
                    )
                  "
                >
                  {{
                    attendanceStatusSymbols[
                      cellStatus(record.student.id, String(column.key), period)!
                    ] ?? "—"
                  }}
                  <span
                    v-if="
                      !cellStatus(record.student.id, String(column.key), period)
                    "
                    class="attendance-empty-arrow"
                    aria-hidden="true"
                    >⌄</span
                  >
                </button>
              </div>
            </div>
          </div>
        </template>
      </ATable>
    </section>
  </div>
</template>

<style scoped>
.attendance-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 42px 36px 60px;
}
.attendance-heading {
  margin-bottom: 20px;
}
.attendance-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 12px;
}
.attendance-search {
  width: 220px;
}
.attendance-filter {
  width: 118px;
}
.attendance-gender-filter {
  width: 108px;
}
.attendance-month-picker {
  width: 142px;
}
.attendance-search,
.attendance-filter,
.attendance-month-picker {
  min-height: 34px;
}
.attendance-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  min-height: 26px;
  margin: 0 2px 10px;
  color: #77827a;
  font-size: 11px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.legend-item i {
  display: inline-grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 4px;
  font-size: 11px;
  font-style: normal;
  line-height: 1;
}
.legend-scheduled {
  background: #a9cce8;
}
.legend-present {
  background: #b9d8b2;
}
.legend-sick_leave {
  background: #f2d4a3;
}
.legend-personal_leave {
  background: #cfd6ef;
}
.legend-absent {
  background: #e9b7ad;
}
.legend-empty {
  border: 1px solid #d8ded8;
  background: #fff;
}
.legend-tip {
  margin-left: auto;
  color: #a1a9a2;
}
.attendance-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-height: 34px;
  margin: 0 0 10px;
  padding: 8px 12px;
  border: 1px solid #e1e8df;
  border-radius: 8px;
  background: #f8fbf7;
  color: #647167;
  font-size: 12px;
}
.attendance-summary-title {
  color: #46654d;
  font-weight: 650;
}
.attendance-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.attendance-summary-item i {
  display: inline-grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 4px;
  font-style: normal;
  line-height: 1;
}
.attendance-summary-scheduled i {
  color: #326e9e;
  background: #eaf3fb;
}
.attendance-summary-present i {
  color: #4e7155;
  background: #edf6ea;
}
.attendance-summary-sick_leave i {
  color: #926f38;
  background: #fff4df;
}
.attendance-summary-personal_leave i {
  color: #65749a;
  background: #eff1f9;
}
.attendance-summary-absent i {
  color: #a1594c;
  background: #fff0ec;
}
.attendance-summary-empty {
  color: #849087;
}
.attendance-error {
  margin-bottom: 10px;
}
.attendance-matrix-panel {
  overflow: hidden;
  border: 1px solid #e1e6df;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(38, 57, 43, 0.035);
}
.attendance-table {
  font-size: 12px;
}
.attendance-table :deep(.ant-table) {
  background: transparent;
}
.attendance-table :deep(.ant-table-thead > tr > th) {
  height: 56px;
  padding: 8px 6px;
  color: #7d8980;
  background: #f8faf7;
  font-size: 11px;
  font-weight: 650;
  text-align: center;
}
.attendance-table :deep(.ant-table-thead > tr > th:first-child) {
  padding-left: 10px;
  text-align: left;
}
.attendance-table :deep(.ant-table-tbody > tr > td) {
  height: 52px;
  padding: 7px 5px;
  border-bottom-color: #edf0eb;
  text-align: center;
}
.attendance-table :deep(.ant-table-tbody > tr > td:first-child) {
  padding-left: 10px;
  padding-right: 6px;
  text-align: left;
}
.attendance-table :deep(.attendance-weekend-column) {
  background: #fbfaf6;
}
.attendance-table :deep(.attendance-today-column) {
  background: #f0f7ee;
}
.attendance-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fbfcfa !important;
}
.attendance-table
  :deep(.ant-table-tbody > tr:hover > .attendance-weekend-column) {
  background: #faf8f2 !important;
}
.attendance-table
  :deep(.ant-table-tbody > tr:hover > .attendance-today-column) {
  background: #eaf4e7 !important;
}
.attendance-table :deep(.ant-table-cell-fix-left) {
  z-index: 2;
  background: #fff;
  box-shadow: 1px 0 0 #e8ece7;
}
.attendance-table :deep(.ant-table-thead .ant-table-cell-fix-left) {
  background: #f8faf7;
}
.attendance-date-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.attendance-date-head strong {
  color: #5f6f65;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.attendance-date-head span {
  color: #a0a8a2;
  font-size: 9px;
  font-weight: 500;
}
.attendance-date-head.weekend strong,
.attendance-date-head.weekend span {
  color: #a38d70;
}
.attendance-date-head.today strong {
  color: #3d7750;
}
.attendance-date-head.today span {
  color: #6d9a79;
}
.attendance-student-name {
  display: block;
  overflow: hidden;
  color: #385d43;
  font-weight: 650;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attendance-student-name:hover {
  color: #1e3d27;
}
.attendance-day {
  display: grid;
  gap: 3px;
}
.attendance-period-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.attendance-period-label {
  color: #89958d;
  font-size: 10px;
  white-space: nowrap;
}
.attendance-cell {
  display: grid;
  place-items: center;
  min-height: 28px;
  min-width: 32px;
  border-radius: 6px;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.attendance-cell.saved {
  background: #edf6ea;
  box-shadow: inset 0 0 0 1px #b9d5b5;
}
.attendance-cell.failed {
  background: #fff1ed;
  box-shadow: inset 0 0 0 1px #e4b8ad;
}
.attendance-cell.future {
  color: #c3c8c4;
}
.future-cell-mark {
  color: #c3c8c4;
  font-size: 12px;
}
.attendance-cell-select {
  width: 32px;
}
.attendance-cell-button {
  position: relative;
  width: 32px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  font: inherit;
  font-size: 15px;
  line-height: 28px;
  cursor: pointer;
}
.attendance-cell-button:hover {
  box-shadow: inset 0 0 0 1px #cad8ca;
}
.attendance-cell-button:focus-visible {
  outline: 2px solid #739b7a;
  outline-offset: 1px;
}
.attendance-cell-button.attendance-empty {
  color: #aeb6af;
  background: transparent;
  padding-right: 9px;
}
.attendance-empty-arrow {
  position: absolute;
  right: 3px;
  color: #b8c0ba;
}
.attendance-cell-select :deep(.ant-select-selector) {
  height: 28px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 5px !important;
  box-shadow: none !important;
}
.attendance-cell-select :deep(.ant-select-selection-item),
.attendance-cell-select :deep(.ant-select-selection-placeholder) {
  padding-inline-end: 0 !important;
  font-size: 15px;
  line-height: 28px !important;
  text-align: center;
}
.attendance-cell-select :deep(.ant-select-selection-placeholder) {
  color: #aeb6af;
}
.attendance-cell-select:not(.attendance-empty) :deep(.ant-select-arrow) {
  display: none;
}
.attendance-cell-select:not(.attendance-empty)
  :deep(.ant-select-selection-item) {
  padding-inline-end: 0 !important;
}
.attendance-cell-button.attendance-scheduled,
.attendance-scheduled :deep(.ant-select-selector) {
  color: #326e9e;
  background: #eaf3fb !important;
}
.attendance-cell-button.attendance-present,
.attendance-present :deep(.ant-select-selector) {
  color: #4e7155;
  background: #edf6ea !important;
}
.attendance-cell-button.attendance-sick_leave,
.attendance-sick_leave :deep(.ant-select-selector) {
  color: #926f38;
  background: #fff4df !important;
}
.attendance-cell-button.attendance-personal_leave,
.attendance-personal_leave :deep(.ant-select-selector) {
  color: #65749a;
  background: #eff1f9 !important;
}
.attendance-cell-button.attendance-absent,
.attendance-absent :deep(.ant-select-selector) {
  color: #a1594c;
  background: #fff0ec !important;
}
.attendance-empty :deep(.ant-select-selector) {
  background: transparent !important;
}
@media (max-width: 720px) {
  .attendance-page {
    padding: 28px 16px 42px;
  }
  .attendance-heading {
    align-items: flex-end;
    flex-direction: row;
    justify-content: space-between;
    gap: 12px;
  }
  .attendance-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .attendance-search,
  .attendance-filter,
  .attendance-gender-filter,
  .attendance-month-picker {
    width: 100%;
  }
  .attendance-search,
  .attendance-month-picker {
    grid-column: 1 / -1;
  }
  .attendance-legend {
    gap: 8px 12px;
  }
  .attendance-summary {
    gap: 7px 10px;
  }
  .attendance-summary-title {
    flex-basis: 100%;
  }
  .legend-tip {
    flex-basis: 100%;
    margin-left: 0;
  }
}
@media (max-width: 360px) {
  .attendance-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
