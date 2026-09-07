import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import {
  createStudent,
  getStudentEdit,
  getStudents,
  updateStudent,
} from "~/services/students";
import { ServiceError } from "~/services/http";
import { notifyStudentChange } from "./useStudentInvalidation";
import { validateProfile } from "~/utils/student-profile-validation";
import type {
  StudentDetail,
  StudentDuplicateCandidate,
  StudentProfileFields,
} from "../../types/api/students";

const empty = (): Omit<StudentProfileFields, "grade"> & {
  grade: StudentProfileFields["grade"];
} => ({
  name: "",
  grade: null,
  school: null,
  className: null,
  gender: null,
  enrolledAt: null,
  guardianName: null,
  guardianPhone: null,
  note: null,
});
export function useStudentProfile(
  saved: (student: StudentDetail, created: boolean) => void,
) {
  const open = ref(false),
    loading = ref(false),
    saving = ref(false),
    error = ref(""),
    conflict = ref(false),
    uncertain = ref(false),
    ready = ref(false);
  const editingId = ref<string>(),
    version = ref(0),
    candidates = ref<StudentDuplicateCandidate[]>([]),
    checkedCount = ref<number | null>(null);
  const draft = reactive(empty()),
    baseline = ref("");
  const dirty = computed(
    () => open.value && ready.value && JSON.stringify(draft) !== baseline.value,
  );
  let controller: AbortController | undefined;
  const errorCode = ref<string>();
  const fieldErrors = computed(() => validateProfile(draft));
  const invalid = computed(() => Object.keys(fieldErrors.value).length > 0);
  watch(
    () => [draft.name, draft.school, draft.className],
    () => {
      candidates.value = [];
      checkedCount.value = null;
      if (errorCode.value === "STUDENT_POSSIBLE_DUPLICATE") {
        error.value = "";
        errorCode.value = undefined;
      }
    },
    { flush: "sync" },
  );
  async function begin(id?: string) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    open.value = true;
    editingId.value = id;
    ready.value = false;
    error.value = "";
    errorCode.value = undefined;
    conflict.value = false;
    uncertain.value = false;
    candidates.value = [];
    checkedCount.value = null;
    Object.assign(draft, empty());
    loading.value = false;
    if (!id) {
      baseline.value = JSON.stringify(draft);
      ready.value = true;
      return;
    }
    loading.value = true;
    try {
      const data = await getStudentEdit(id, request.signal);
      if (request.signal.aborted) return;
      // Never use the masked detail DTO as a form source.
      Object.assign(draft, {
        name: data.name,
        grade: data.grade,
        school: data.school,
        className: data.className,
        gender: data.gender,
        enrolledAt: data.enrolledAt,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        note: data.note,
      });
      version.value = data.version;
      baseline.value = JSON.stringify(draft);
      ready.value = true;
    } catch (cause) {
      if (!request.signal.aborted)
        error.value =
          cause instanceof ServiceError
            ? cause.message
            : "编辑回填失败，请重试。";
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  function close() {
    if (saving.value) return;
    controller?.abort();
    open.value = false;
    ready.value = false;
    loading.value = false;
    Object.assign(draft, empty());
    baseline.value = "";
    candidates.value = [];
  }
  async function save(confirmed = false) {
    if (
      saving.value ||
      loading.value ||
      !ready.value ||
      conflict.value ||
      uncertain.value
    )
      return;
    if (Object.keys(validateProfile(draft)).length) return;
    if (confirmed && !candidates.value.length) return;
    saving.value = true;
    error.value = "";
    errorCode.value = undefined;
    try {
      const created = !editingId.value;
      const fields = { ...draft, grade: draft.grade };
      const result = editingId.value
        ? await updateStudent({
            ...fields,
            id: editingId.value,
            expectedVersion: version.value,
          })
        : await createStudent({
            ...fields,
            ...(confirmed ? { confirmPossibleDuplicate: true } : {}),
          });
      saving.value = false;
      close();
      notifyStudentChange();
      saved(result, created);
    } catch (cause) {
      errorCode.value = cause instanceof ServiceError ? cause.code : undefined;
      if (
        cause instanceof ServiceError &&
        cause.code === "STUDENT_POSSIBLE_DUPLICATE"
      )
        candidates.value = cause.candidates ?? [];
      else if (cause instanceof ServiceError && cause.statusCode === 409)
        conflict.value = true;
      // Storage/transport failures may have happened after commit. Do not replay.
      else if (!(cause instanceof ServiceError) || cause.statusCode >= 500)
        uncertain.value = true;
      error.value =
        cause instanceof ServiceError
          ? cause.message
          : "保存结果不明，请先刷新核对，不要直接重复创建。";
    } finally {
      saving.value = false;
    }
  }
  async function checkUncertain() {
    if (loading.value || saving.value) return;
    loading.value = true;
    try {
      const page = await getStudents({
        keyword: draft.name.trim(),
        page: 1,
        pageSize: 8,
      });
      checkedCount.value = page.total;
      notifyStudentChange();
      error.value =
        "已刷新核对查询。请先关闭侧栏查看同名档案，确认是否已保存；本次不会重新提交。";
      // Keep blocked until the user closes/reopens; never automatically replay.
    } catch {
      error.value = "核对查询失败；草稿保留，请稍后重试。";
    } finally {
      loading.value = false;
    }
  }
  onScopeDispose(() => {
    controller?.abort();
    Object.assign(draft, empty());
  });
  return {
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
    version,
    candidates,
    checkedCount,
    draft,
    dirty,
    begin,
    close,
    save,
    checkUncertain,
  };
}
