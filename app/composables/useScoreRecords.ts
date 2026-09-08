import { onScopeDispose, reactive, ref, watch } from "vue";
import type {
  ScoreRecord,
  ScoreRecordDraft,
  ScoreRecordType,
} from "../../types/api/score-records";
import {
  createScoreRecord,
  getScoreRecords,
  reloadScoreRecord,
  updateScoreRecord,
} from "~/services/score-records";
import { ServiceError } from "~/services/http";
import { useStudentInvalidation } from "./useStudentInvalidation";

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

function emptyDraft(studentId = ""): ScoreRecordDraft {
  return {
    studentId,
    examDate: shanghaiToday(),
    subject: "",
    type: "quiz",
    examName: "",
    score: "",
    fullScore: "100",
  };
}

function validDecimal(value: string) {
  return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/u.test(value.trim());
}

export function useScoreRecords(fixedStudentId: () => string | undefined) {
  const items = ref<ScoreRecord[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = fixedStudentId() ? 5 : 10;
  const keyword = ref("");
  const studentId = ref<string>();
  const subject = ref<string>();
  const type = ref<ScoreRecordType>();
  const dates = ref<[string, string]>();
  const loading = ref(false);
  const error = ref("");
  const notice = ref("");
  const open = ref(false);
  const saving = ref(false);
  const formError = ref("");
  const conflict = ref(false);
  const reloading = ref(false);
  const editing = ref<ScoreRecord | null>(null);
  const draft = reactive<ScoreRecordDraft>(emptyDraft());
  let controller: AbortController | undefined;
  let editController: AbortController | undefined;
  let generation = 0;

  const message = (cause: unknown, fallback: string) =>
    cause instanceof ServiceError ? cause.message : fallback;

  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    try {
      const result = await getScoreRecords(
        {
          page: page.value,
          pageSize,
          keyword: keyword.value.trim() || undefined,
          studentId: fixedStudentId() ?? studentId.value,
          subject: subject.value,
          type: type.value,
          dateFrom: dates.value?.[0],
          dateTo: dates.value?.[1],
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      items.value = result.items;
      total.value = result.total;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value = message(cause, "无法加载成绩记录，请重试。");
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }

  function resetFilters() {
    keyword.value = "";
    studentId.value = undefined;
    subject.value = undefined;
    type.value = undefined;
    dates.value = undefined;
  }

  function begin(record?: ScoreRecord) {
    if (saving.value || reloading.value) return;
    editController?.abort();
    editing.value = record ? { ...record } : null;
    Object.assign(
      draft,
      record
        ? {
            studentId: record.studentId,
            examDate: record.examDate,
            subject: record.subject,
            type: record.type,
            examName: record.examName,
            score: record.score,
            fullScore: record.fullScore,
          }
        : emptyDraft(fixedStudentId()),
    );
    formError.value = "";
    conflict.value = false;
    open.value = true;
  }

  function close() {
    if (!saving.value && !reloading.value) open.value = false;
  }

  function validate() {
    if (!draft.studentId) return "请选择学生。";
    if (!draft.examDate) return "请选择日期。";
    if (draft.examDate < "1900-01-01" || draft.examDate > shanghaiToday())
      return "日期须在1900-01-01至今天之间。";
    if (!draft.subject.trim() || [...draft.subject.trim()].length > 64)
      return "请从已有科目中选择。";
    if (!draft.examName.trim() || [...draft.examName.trim()].length > 160)
      return "请填写1–160字的考试名称。";
    if (!validDecimal(draft.score) || !validDecimal(draft.fullScore))
      return "得分和满分须为最多两位小数的非负数字。";
    const score = Number(draft.score);
    const fullScore = Number(draft.fullScore);
    if (fullScore <= 0) return "满分必须大于0。";
    if (score > fullScore) return "得分不能大于满分。";
    return "";
  }

  async function save() {
    if (saving.value || reloading.value || conflict.value || !open.value)
      return;
    const validation = validate();
    if (validation) {
      formError.value = validation;
      return;
    }
    const context = generation;
    const record = editing.value;
    saving.value = true;
    formError.value = "";
    notice.value = "";
    const fields = {
      studentId: draft.studentId,
      examDate: draft.examDate,
      subject: draft.subject.trim(),
      type: draft.type,
      examName: draft.examName.trim(),
      score: draft.score.trim(),
      fullScore: draft.fullScore.trim(),
    };
    try {
      if (record)
        await updateScoreRecord({
          ...fields,
          id: record.id,
          expectedVersion: record.version,
        });
      else await createScoreRecord(fields);
      if (context !== generation) return;
      open.value = false;
      notice.value = record ? "成绩已更新。" : "成绩已新增。";
      if (!record && page.value !== 1) page.value = 1;
      else await refresh();
    } catch (cause) {
      if (context !== generation) return;
      conflict.value =
        cause instanceof ServiceError && cause.statusCode === 409;
      formError.value = message(
        cause,
        "保存结果不明，请先刷新列表核对；草稿已保留，请勿重复新增。",
      );
    } finally {
      if (context === generation) saving.value = false;
    }
  }

  async function reloadEditing() {
    if (!editing.value || saving.value || reloading.value) return;
    editController?.abort();
    const request = new AbortController();
    editController = request;
    reloading.value = true;
    try {
      const current = await reloadScoreRecord(editing.value.id, request.signal);
      if (request.signal.aborted) return;
      editing.value = current;
      Object.assign(draft, {
        studentId: current.studentId,
        examDate: current.examDate,
        subject: current.subject,
        type: current.type,
        examName: current.examName,
        score: current.score,
        fullScore: current.fullScore,
      });
      conflict.value = false;
      formError.value = "";
    } catch (cause) {
      if (!request.signal.aborted)
        formError.value = message(cause, "重载失败，草稿已保留。");
    } finally {
      if (!request.signal.aborted) reloading.value = false;
    }
  }

  watch([keyword, studentId, subject, type, dates], () => {
    if (page.value !== 1) page.value = 1;
    else void refresh();
  });
  watch(page, () => void refresh());
  watch(
    fixedStudentId,
    () => {
      generation++;
      editController?.abort();
      open.value = false;
      editing.value = null;
      resetFilters();
      page.value = 1;
      void refresh();
    },
    { immediate: true },
  );
  useStudentInvalidation(refresh);
  onScopeDispose(() => {
    generation++;
    controller?.abort();
    editController?.abort();
  });

  return {
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
  };
}
