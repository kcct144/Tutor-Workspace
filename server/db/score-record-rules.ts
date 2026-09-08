import {
  scoreRecordTypes,
  type ScoreRecordCreate,
  type ScoreRecordQuery,
  type ScoreRecordType,
  type ScoreRecordUpdate,
} from "../../types/api/score-records.ts";
import {
  dateOnly,
  positiveId,
  shanghaiToday,
  uint,
} from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import { requiredSubject } from "./subject-rules.ts";
import { ApiError } from "../utils/api.ts";

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}

function scoreType(value: unknown): ScoreRecordType {
  if (!scoreRecordTypes.includes(value as ScoreRecordType))
    invalid("成绩类型仅支持小测或考试。");
  return value as ScoreRecordType;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") invalid(name + "必须为文本。");
  const normalized = value.trim();
  if (!normalized || [...normalized].length > max)
    invalid(name + "须为1–" + max + "字符。");
  return normalized;
}

function decimal(
  value: unknown,
  name: string,
): { value: string; cents: number } {
  if (typeof value !== "string") invalid(name + "须为最多两位小数的数字。");
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match) invalid(name + "须为最多两位小数的非负数字。");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return {
    value: normalized,
    // The grammar limits this to 9,999,999,999 cents, within safe integers.
    cents: Number(match[1]) * 100 + Number(fraction || "0"),
  };
}

export function parseScoreRecordWrite(
  body: unknown,
  update: true,
  today?: string,
): ScoreRecordUpdate;
export function parseScoreRecordWrite(
  body: unknown,
  update?: false,
  today?: string,
): ScoreRecordCreate;
export function parseScoreRecordWrite(
  body: unknown,
  update = false,
  today = shanghaiToday(),
): ScoreRecordCreate | ScoreRecordUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("成绩请求须为JSON对象。");
  const input = body as Record<string, unknown>;
  const allowed = [
    "studentId",
    "examDate",
    "subject",
    "type",
    "examName",
    "score",
    "fullScore",
    ...(update ? ["id", "expectedVersion"] : []),
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("请求含不可写字段。");
  const examDate = dateOnly(input.examDate);
  if (examDate < "1900-01-01" || examDate > today)
    invalid("成绩日期须在1900-01-01至今天之间。");
  const score = decimal(input.score, "得分");
  const fullScore = decimal(input.fullScore, "满分");
  if (fullScore.cents <= 0) invalid("满分必须大于0。");
  if (score.cents > fullScore.cents) invalid("得分不能大于满分。");
  const fields = {
    studentId: positiveId(input.studentId),
    examDate,
    subject: requiredSubject(input.subject),
    type: scoreType(input.type),
    examName: text(input.examName, "考试名称", 160),
    score: score.value,
    fullScore: fullScore.value,
  };
  return update
    ? {
        ...fields,
        id: positiveId(input.id),
        expectedVersion: uint(input.expectedVersion, "版本号", true),
      }
    : fields;
}

export function parseScoreRecordQuery(
  input: Record<string, unknown>,
): ScoreRecordQuery & { page: number; pageSize: number } {
  const allowed = [
    "page",
    "pageSize",
    "keyword",
    "studentId",
    "subject",
    "type",
    "dateFrom",
    "dateTo",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("查询参数无效。");
  const pagination = parseStudentQuery({
    page: input.page,
    pageSize: input.pageSize ?? "10",
    keyword: input.keyword,
  });
  const dateFrom =
    input.dateFrom === undefined ? undefined : dateOnly(input.dateFrom);
  const dateTo =
    input.dateTo === undefined ? undefined : dateOnly(input.dateTo);
  if (
    (dateFrom && dateFrom < "1900-01-01") ||
    (dateTo && dateTo < "1900-01-01") ||
    (dateFrom && dateTo && dateFrom > dateTo)
  )
    invalid("日期范围无效。");
  return {
    ...pagination,
    studentId:
      input.studentId === undefined ? undefined : positiveId(input.studentId),
    subject:
      input.subject === undefined ? undefined : requiredSubject(input.subject),
    type: input.type === undefined ? undefined : scoreType(input.type),
    dateFrom,
    dateTo,
  };
}

export function parseScoreRecordSubjectQuery(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (key) => !["page", "pageSize", "keyword"].includes(key),
    )
  )
    invalid("查询参数无效。");
  return parseStudentQuery({
    page: input.page,
    pageSize: input.pageSize ?? "20",
    keyword: input.keyword,
  });
}
