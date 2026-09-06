import {
  contractTypes,
  contractStatuses,
  type ContractWrite,
  type ContractUpdate,
  type ContractQuery,
  type ContractStatus,
} from "../../types/api/contracts.ts";
import { ApiError } from "../utils/api.ts";
import { parseStudentId, parseStudentQuery } from "./student-query.ts";

export function shanghaiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
export function positiveId(value: unknown): string {
  return parseStudentId({ id: value });
}
export function uint(value: unknown, name: string, positive = false): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 4294967295
  )
    invalid(name + "须为有效范围内的整数。");
  return value;
}
export function dateOnly(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1000-01-01" ||
    value > "9999-12-31"
  )
    invalid("请填写有效日期。");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid("请填写有效日期。");
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || [...value].length > max)
    invalid("文本参数无效或超长。");
  return value.trim();
}
export function parseContractWrite(body: unknown, update: true): ContractUpdate;
export function parseContractWrite(
  body: unknown,
  update?: false,
): ContractWrite;
export function parseContractWrite(
  body: unknown,
  update = false,
): ContractWrite | ContractUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("合同请求须为JSON对象。");
  const input = body as Record<string, unknown>;
  const fields = [
    "studentId",
    "subject",
    "contractType",
    "startDate",
    "endDate",
    "attendedLessons",
    "totalLessons",
    "makeupLessons",
    ...(update ? ["id", "expectedVersion"] : []),
  ];
  if (Object.keys(input).some((key) => !fields.includes(key)))
    invalid("请求含不可写字段，编号和操作人不能由浏览器提供。");
  const studentId = positiveId(input.studentId);
  const subject = text(input.subject, 64);
  if (!subject) invalid("科目不能为空。");
  if (!contractTypes.some((type) => type === input.contractType))
    invalid("合同类型无效。");
  const contractType = input.contractType as ContractWrite["contractType"];
  const makeupLessons = uint(input.makeupLessons ?? 0, "需补课数");
  let startDate: string | null = null,
    endDate: string | null = null;
  let attendedLessons: number | null = null,
    totalLessons: number | null = null;
  if (contractType === "lessons") {
    if (input.startDate !== null || input.endDate !== null)
      invalid("按课时合同的日期必须为空。");
    attendedLessons = uint(input.attendedLessons, "已上课时");
    totalLessons = uint(input.totalLessons, "总课时", true);
    if (attendedLessons > totalLessons) invalid("已上课时不能超过总课时。");
  } else {
    if (input.attendedLessons !== null || input.totalLessons !== null)
      invalid("时间合同的课时字段必须为空。");
    startDate = dateOnly(input.startDate);
    endDate = dateOnly(input.endDate);
    if (startDate > endDate) invalid("开始日期不能晚于到期日期。");
  }
  const data = {
    studentId,
    subject,
    contractType,
    startDate,
    endDate,
    attendedLessons,
    totalLessons,
    makeupLessons,
  };
  return update
    ? {
        ...data,
        id: positiveId(input.id),
        expectedVersion: uint(input.expectedVersion, "版本号", true),
      }
    : data;
}
export function parseContractQuery(
  input: Record<string, unknown>,
  subjects = false,
): ContractQuery & { page: number; pageSize: number } {
  const allowed = [
    "page",
    "pageSize",
    "keyword",
    ...(subjects ? [] : ["studentId", "subject", "contractType", "status"]),
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("查询参数无效。");
  const page = parseStudentQuery(
    { page: input.page, pageSize: input.pageSize, keyword: input.keyword },
    subjects,
  );
  const studentId =
    input.studentId === undefined ? undefined : positiveId(input.studentId);
  const subject =
    input.subject === undefined ? undefined : text(input.subject, 64);
  if (subject === "") invalid("筛选科目不能为空。");
  if (
    input.contractType !== undefined &&
    !contractTypes.some((v) => v === input.contractType)
  )
    invalid("合同类型无效。");
  if (
    input.status !== undefined &&
    !contractStatuses.some((v) => v === input.status)
  )
    invalid("合同状态无效。");
  return {
    page: page.page,
    pageSize: page.pageSize,
    keyword: page.keyword,
    studentId,
    subject,
    contractType: input.contractType as ContractQuery["contractType"],
    status: input.status as ContractStatus | undefined,
  };
}
/** This SQL expression is shared by filters, returned status, and student aggregates. */
export const contractStatusSql =
  "CASE WHEN c.contract_type = 'lessons' THEN CASE WHEN c.attended_lessons < c.total_lessons THEN '生效中' ELSE '已用完' END WHEN c.start_date > ? THEN '未开始' WHEN c.end_date < ? THEN '已到期' ELSE '生效中' END";
