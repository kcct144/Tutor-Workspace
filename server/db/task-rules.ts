import { ApiError } from "../utils/api.ts";
import { positiveId, uint } from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import { requiredSubject } from "./subject-rules.ts";
import {
  taskStatuses,
  type TaskStatus,
  type TaskWrite,
  type TaskUpdate,
  type TaskStatusWrite,
  type TaskQuery,
} from "../../types/api/tasks.ts";
function invalid(message = "任务参数无效。"): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
function object(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !fields.includes(key)))
    invalid("请求含不可写字段，操作人不能由浏览器提供。");
  return input;
}
function text(value: unknown, max: number, name: string) {
  if (typeof value !== "string") invalid(name + "不能为空。");
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > max)
    invalid(name + "须为1–" + max + "字符。");
  return trimmed;
}
function status(value: unknown): TaskStatus {
  if (!taskStatuses.some((item) => item === value))
    invalid("任务状态只能为启用或停用。");
  return value as TaskStatus;
}
export function parseTaskWrite(value: unknown): TaskWrite {
  const input = object(value, ["title", "subject", "description"]);
  return {
    title: text(input.title, 160, "任务名称"),
    subject: requiredSubject(input.subject),
    description: text(input.description, 10000, "任务说明"),
  };
}
export function parseTaskUpdate(value: unknown): TaskUpdate {
  const input = object(value, [
    "id",
    "title",
    "subject",
    "description",
    "status",
    "expectedVersion",
  ]);
  return {
    ...parseTaskWrite({
      title: input.title,
      subject: input.subject,
      description: input.description,
    }),
    id: positiveId(input.id),
    status: status(input.status),
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}
export function parseTaskStatus(value: unknown): TaskStatusWrite {
  const input = object(value, ["id", "status", "expectedVersion"]);
  return {
    id: positiveId(input.id),
    status: status(input.status),
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}
export function parseTaskQuery(
  value: Record<string, unknown>,
  options = false,
): TaskQuery & { page: number; pageSize: number } {
  const input = object(value, [
    "page",
    "pageSize",
    "keyword",
    ...(options ? [] : ["subject", "status"]),
  ]);
  const page = parseStudentQuery(
    { page: input.page, pageSize: input.pageSize, keyword: input.keyword },
    options,
  );
  return {
    page: page.page,
    pageSize: page.pageSize,
    keyword: page.keyword,
    ...(input.subject === undefined
      ? {}
      : { subject: requiredSubject(input.subject) }),
    ...(input.status === undefined ? {} : { status: status(input.status) }),
  };
}
