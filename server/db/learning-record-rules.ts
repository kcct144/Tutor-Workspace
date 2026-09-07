import {
  recordCategories,
  type RecordCategory,
  type RecordCreate,
  type RecordUpdate,
  type RecordQuery,
} from "../../types/api/learning-records.ts";
import {
  dateOnly,
  positiveId,
  uint,
  shanghaiToday,
} from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import { optionalSubject, requiredSubject } from "./subject-rules.ts";
import { ApiError } from "../utils/api.ts";
function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
function category(value: unknown): RecordCategory {
  if (!recordCategories.some((v) => v === value))
    invalid("分类仅支持缺、补、强。");
  return value as RecordCategory;
}
export function parseRecordWrite(
  body: unknown,
  update: true,
  today?: string,
): RecordUpdate;
export function parseRecordWrite(
  body: unknown,
  update?: false,
  today?: string,
): RecordCreate;
export function parseRecordWrite(
  body: unknown,
  update = false,
  today = shanghaiToday(),
): RecordCreate | RecordUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("记录请求须为JSON对象。");
  const input = body as Record<string, unknown>;
  const allowed = [
    "category",
    "subject",
    "content",
    "occurredOn",
    ...(update ? ["id", "expectedVersion"] : ["studentId"]),
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    invalid("请求含不可写字段，不能修改作者、学生归属或服务端版本。");
  if (typeof input.content !== "string") invalid("正文必须为文本。");
  const content = input.content.trim();
  if ([...content].length < 1 || [...content].length > 10000)
    invalid("正文去除首尾空白后须为1–10000字。");
  const occurredOn = dateOnly(input.occurredOn);
  if (occurredOn > today) invalid("发生日期不得晚于今天。");
  const fields = {
    category: category(input.category),
    subject:
      input.subject === undefined ? null : optionalSubject(input.subject),
    content,
    occurredOn,
  };
  return update
    ? {
        ...fields,
        id: positiveId(input.id),
        expectedVersion: uint(input.expectedVersion, "版本号", true),
      }
    : { ...fields, studentId: positiveId(input.studentId) };
}
export function parseRecordQuery(
  input: Record<string, unknown>,
): RecordQuery & { page: number; pageSize: number } {
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "studentId",
          "page",
          "pageSize",
          "category",
          "subject",
          "keyword",
          "dateFrom",
          "dateTo",
        ].includes(k),
    )
  )
    invalid("查询参数无效。");
  const pagination = parseStudentQuery({
    page: input.page,
    pageSize: input.pageSize ?? "5",
    keyword: input.keyword,
  });
  const dateFrom =
    input.dateFrom === undefined ? undefined : dateOnly(input.dateFrom);
  const dateTo =
    input.dateTo === undefined ? undefined : dateOnly(input.dateTo);
  if (dateFrom && dateTo && dateFrom > dateTo)
    invalid("开始日期不得晚于结束日期。");
  return {
    studentId: positiveId(input.studentId),
    page: pagination.page,
    pageSize: pagination.pageSize,
    keyword: pagination.keyword,
    category:
      input.category === undefined ? undefined : category(input.category),
    subject:
      input.subject === undefined ? undefined : requiredSubject(input.subject),
    dateFrom,
    dateTo,
  };
}
