import { computed, onScopeDispose, ref, watch } from "vue";
import type { StudentGrade, StudentStatus } from "../../types/api/students";
import type {
  AttendancePeriod,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceStudent,
  AttendanceTodaySummary,
} from "../../types/api/attendance";
import {
  getAttendanceMonth,
  getAttendanceTodaySummary,
  setAttendanceCell,
} from "~/services/attendance";
import { ServiceError } from "~/services/http";

const periodPreferenceKey = "tutor-workspace:attendance:period";

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function monthDays(month: string) {
  const [year = 0, monthNumber = 0] = month.split("-").map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  const today = shanghaiToday();
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    return {
      iso,
      day,
      weekday: labels[weekday]!,
      weekend: weekday === 0 || weekday === 6,
      today: iso === today,
      future: iso > today,
    };
  });
}

function readPeriod(): AttendancePeriod | "all" {
  if (!import.meta.client) return "morning";
  try {
    const value = window.sessionStorage.getItem(periodPreferenceKey);
    return value === "all" ||
      value === "morning" ||
      value === "afternoon" ||
      value === "evening"
      ? value
      : "morning";
  } catch {
    return "morning";
  }
}

function savePeriod(value: AttendancePeriod | "all") {
  if (!import.meta.client) return;
  try {
    window.sessionStorage.setItem(periodPreferenceKey, value);
  } catch {
    // Preference storage is optional and never holds business records.
  }
}

function emptySummary(): AttendanceTodaySummary {
  return {
    date: null,
    counts: {
      scheduled: 0,
      present: 0,
      sick_leave: 0,
      personal_leave: 0,
      absent: 0,
    },
  };
}

export function useAttendance() {
  const month = ref(shanghaiToday().slice(0, 7));
  const keyword = ref("");
  const grade = ref<StudentGrade>();
  const gender = ref<"男" | "女">();
  const status = ref<StudentStatus>("在读");
  const selectedPeriod = ref<AttendancePeriod | "all">(readPeriod());
  const total = ref(0);
  const students = ref<AttendanceStudent[]>([]);
  const records = ref<AttendanceRecord[]>([]);
  const loading = ref(false);
  const error = ref("");
  const summary = ref<AttendanceTodaySummary>(emptySummary());
  const savingKeys = ref(new Set<string>());
  const savedKeys = ref(new Set<string>());
  const cellErrors = ref(new Map<string, string>());
  const cellDrafts = ref(new Map<string, AttendanceStatus>());
  let monthController: AbortController | undefined;
  let summaryController: AbortController | undefined;
  let generation = 0;

  const dates = computed(() => monthDays(month.value));
  const recordMap = computed(
    () =>
      new Map(
        records.value.map((record) => [
          `${record.studentId}:${record.attendanceDate}:${record.period}`,
          record,
        ]),
      ),
  );
  const rows = computed(() =>
    students.value.map((student) => ({ key: student.id, student })),
  );
  const requestQuery = () => ({
    month: month.value,
    keyword: keyword.value.trim() || undefined,
    grade: grade.value,
    gender: gender.value,
    status: status.value,
  });
  const message = (cause: unknown, fallback: string) =>
    cause instanceof ServiceError ? cause.message : fallback;

  async function refreshMonth() {
    monthController?.abort();
    const request = new AbortController();
    monthController = request;
    loading.value = true;
    error.value = "";
    try {
      const result = await getAttendanceMonth(requestQuery(), request.signal);
      if (request.signal.aborted) return;
      students.value = result.students;
      records.value = result.records;
      total.value = result.total;
    } catch (cause) {
      if (!request.signal.aborted) {
        error.value = message(cause, "无法加载出勤数据，请重试。");
        students.value = [];
        records.value = [];
        total.value = 0;
      }
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }

  async function refreshSummary() {
    summaryController?.abort();
    const request = new AbortController();
    summaryController = request;
    try {
      summary.value = await getAttendanceTodaySummary(
        { ...requestQuery(), period: selectedPeriod.value },
        request.signal,
      );
    } catch (cause) {
      if (!request.signal.aborted)
        error.value = message(cause, "无法读取今日出勤汇总，请重试。");
    }
  }

  async function refresh() {
    const current = ++generation;
    await Promise.all([refreshMonth(), refreshSummary()]);
    if (current !== generation) return;
  }

  function resetFilters() {
    keyword.value = "";
    grade.value = undefined;
    gender.value = undefined;
    status.value = "在读";
  }

  function cellKey(
    studentId: string,
    attendanceDate: string,
    period: AttendancePeriod,
  ) {
    return `${studentId}:${attendanceDate}:${period}`;
  }

  async function changeStatus(
    studentId: string,
    attendanceDate: string,
    period: AttendancePeriod,
    nextStatus: AttendanceStatus,
  ) {
    const key = cellKey(studentId, attendanceDate, period);
    if (
      savingKeys.value.has(key) ||
      (attendanceDate > shanghaiToday() && nextStatus !== "scheduled")
    )
      return;
    const existing = recordMap.value.get(key);
    if (existing?.status === nextStatus) return;
    const previous = existing ? { ...existing } : undefined;
    const optimistic: AttendanceRecord = existing
      ? { ...existing, status: nextStatus }
      : {
          id: `pending-${key}`,
          studentId,
          attendanceDate,
          period,
          status: nextStatus,
          version: 0,
          createdAt: "",
          updatedAt: "",
        };
    records.value = [
      ...records.value.filter(
        (record) =>
          !(
            record.studentId === studentId &&
            record.attendanceDate === attendanceDate &&
            record.period === period
          ),
      ),
      optimistic,
    ];
    savingKeys.value = new Set(savingKeys.value).add(key);
    cellErrors.value.delete(key);
    cellDrafts.value = new Map(cellDrafts.value).set(key, nextStatus);
    try {
      const saved = await setAttendanceCell({
        studentId,
        attendanceDate,
        period,
        status: nextStatus,
        expectedVersion: existing?.version ?? null,
      });
      records.value = [
        ...records.value.filter(
          (record) =>
            !(
              record.studentId === studentId &&
              record.attendanceDate === attendanceDate &&
              record.period === period
            ),
        ),
        saved,
      ];
      const drafts = new Map(cellDrafts.value);
      drafts.delete(key);
      cellDrafts.value = drafts;
      savedKeys.value = new Set(savedKeys.value).add(key);
      window.setTimeout(() => {
        const next = new Set(savedKeys.value);
        next.delete(key);
        savedKeys.value = next;
      }, 1300);
      await refreshSummary();
    } catch (cause) {
      records.value = [
        ...records.value.filter(
          (record) =>
            !(
              record.studentId === studentId &&
              record.attendanceDate === attendanceDate &&
              record.period === period
            ),
        ),
        ...(previous ? [previous] : []),
      ];
      const errorMessage = message(
        cause,
        "保存结果不明，原状态已恢复；请刷新当月数据核对。",
      );
      cellErrors.value = new Map(cellErrors.value).set(key, errorMessage);
      error.value = "保存失败：" + errorMessage;
    } finally {
      const next = new Set(savingKeys.value);
      next.delete(key);
      savingKeys.value = next;
    }
  }

  watch([keyword, grade, gender, status, month], () => void refresh());
  watch(selectedPeriod, (value) => {
    savePeriod(value);
    void refreshSummary();
  });
  void refresh();
  onScopeDispose(() => {
    monthController?.abort();
    summaryController?.abort();
  });

  return {
    month,
    keyword,
    grade,
    gender,
    status,
    selectedPeriod,
    total,
    dates,
    rows,
    records,
    recordMap,
    loading,
    error,
    todaySummary: computed(() => summary.value.counts),
    todaySummaryDate: computed(() => summary.value.date),
    savingKeys,
    savedKeys,
    cellErrors,
    cellDrafts,
    refresh,
    resetFilters,
    changeStatus,
    cellKey,
  };
}
