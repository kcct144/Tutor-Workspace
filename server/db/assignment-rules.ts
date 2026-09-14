import { ApiError } from "../utils/api.ts";
import {
  positiveId,
  uint,
  dateOnly,
  shanghaiToday,
} from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import type {
  AssignmentQuery,
  AssignmentBatch,
  AssignmentCompletion,
  AssignmentStatus,
  DueState,
} from "../../types/api/task-assignments.ts";
import type { HomeQuery } from "../../types/api/home.ts";
import { normalizeStudentTag } from "../../types/api/student-tags.ts";
function invalid(message = "任务分配参数无效。"): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
function fields(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("请求含未知字段；操作人及日期基准只能来自服务端。");
  return input;
}
export function parseAssignmentQuery(
  value: Record<string, unknown>,
): AssignmentQuery & { page: number; pageSize: number } {
  const input = fields(value, [
    "page",
    "pageSize",
    "keyword",
    "studentId",
    "taskId",
    "subject",
    "status",
    "dueState",
  ]);
  const page = parseStudentQuery({
    page: input.page,
    pageSize: input.pageSize,
    keyword: input.keyword,
  });
  if (
    input.status !== undefined &&
    !["pending", "completed"].includes(String(input.status))
  )
    invalid();
  if (input.status !== undefined && typeof input.status !== "string") invalid();
  if (
    input.dueState !== undefined &&
    (typeof input.dueState !== "string" ||
      !["overdue", "today", "upcoming"].includes(input.dueState))
  )
    invalid();
  if (
    input.subject !== undefined &&
    (typeof input.subject !== "string" ||
      !input.subject.trim() ||
      [...input.subject].length > 64)
  )
    invalid();
  return {
    page: page.page,
    pageSize: page.pageSize,
    keyword: page.keyword,
    studentId:
      input.studentId === undefined ? undefined : positiveId(input.studentId),
    taskId: input.taskId === undefined ? undefined : positiveId(input.taskId),
    subject:
      typeof input.subject === "string" ? input.subject.trim() : undefined,
    status: input.status as AssignmentStatus | undefined,
    dueState: input.dueState as DueState | undefined,
  };
}
export function parseAssignmentBatch(
  value: unknown,
  today = shanghaiToday(),
): AssignmentBatch {
  const input = fields(value, ["taskId", "studentIds", "dueDate"]);
  if (
    !Array.isArray(input.studentIds) ||
    input.studentIds.length < 1 ||
    input.studentIds.length > 100
  )
    invalid("每次须选择1–100名学生。");
  const studentIds = input.studentIds.map(positiveId);
  if (new Set(studentIds).size !== studentIds.length)
    invalid("学生不可重复选择。");
  const dueDate = dateOnly(input.dueDate);
  if (dueDate < today) invalid("截止日期不得早于今天。");
  return { taskId: positiveId(input.taskId), studentIds, dueDate };
}
export function parseAssignmentCompletion(
  value: unknown,
): AssignmentCompletion {
  const input = fields(value, ["id", "completed", "expectedVersion"]);
  if (typeof input.completed !== "boolean") invalid("完成状态须为布尔值。");
  return {
    id: positiveId(input.id),
    completed: input.completed,
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}
export function assignmentDueState(
  status: AssignmentStatus,
  date: string,
  today = shanghaiToday(),
): DueState | null {
  return status === "completed"
    ? null
    : date < today
      ? "overdue"
      : date === today
        ? "today"
        : "upcoming";
}
export function parseHomeQuery(
  value: Record<string, unknown>,
): HomeQuery & { page: number; pageSize: number } {
  const input = fields(value, ["page", "pageSize", "grade", "tag"]);
  const query = parseStudentQuery({
    page: input.page,
    pageSize: input.pageSize ?? "20",
    grade: input.grade,
  });
  let tag: string | undefined;
  if (input.tag !== undefined) {
    try {
      tag = normalizeStudentTag(input.tag);
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "标签筛选无效。");
    }
  }
  return {
    page: query.page,
    pageSize: query.pageSize,
    grade: query.grade,
    ...(tag === undefined ? {} : { tag }),
  };
}
