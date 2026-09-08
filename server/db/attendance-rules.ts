import {
  attendancePeriods,
  attendanceStatuses,
  type AttendanceCellWrite,
  type AttendancePeriod,
  type AttendanceRosterQuery,
  type AttendanceStatus,
} from "../../types/api/attendance.ts";
import {
  studentGrades,
  type StudentGrade,
  type StudentStatus,
} from "../../types/api/students.ts";
import {
  dateOnly,
  positiveId,
  shanghaiToday,
  uint,
} from "./contracts-rules.ts";
import { ApiError } from "../utils/api.ts";

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}

function month(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/u.test(value))
    invalid("月份格式无效。");
  const first = value + "-01";
  if (first < "1900-01-01") invalid("月份格式无效。");
  const date = new Date(first + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 7) !== value
  )
    invalid("月份格式无效。");
  return value;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || [...value].length > max)
    invalid("查询参数无效。");
  return value.trim();
}

function status(value: unknown): AttendanceStatus {
  if (!attendanceStatuses.includes(value as AttendanceStatus))
    invalid("出勤状态无效。");
  return value as AttendanceStatus;
}

function period(value: unknown): AttendancePeriod {
  if (!attendancePeriods.includes(value as AttendancePeriod))
    invalid("出勤时段无效。");
  return value as AttendancePeriod;
}

export function parseAttendanceMonthQuery(
  input: Record<string, unknown>,
): AttendanceRosterQuery {
  const allowed = ["month", "keyword", "grade", "gender", "status"];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("查询参数无效。");
  const grade = input.grade === undefined ? undefined : text(input.grade, 16);
  const gender = input.gender === undefined ? undefined : text(input.gender, 2);
  const studentStatus =
    input.status === undefined ? undefined : text(input.status, 16);
  if (grade !== undefined && !studentGrades.includes(grade as StudentGrade))
    invalid("年级筛选无效。");
  if (gender !== undefined && gender !== "男" && gender !== "女")
    invalid("性别筛选无效。");
  if (
    studentStatus !== undefined &&
    !["在读", "待分配", "已结课"].includes(studentStatus)
  )
    invalid("学生状态筛选无效。");
  return {
    month: month(input.month),
    keyword: input.keyword === undefined ? undefined : text(input.keyword, 64),
    grade: grade as StudentGrade | undefined,
    gender: gender as "男" | "女" | undefined,
    status: studentStatus as StudentStatus | undefined,
  };
}

export function parseAttendanceSummaryQuery(
  input: Record<string, unknown>,
): AttendanceRosterQuery & { period: AttendancePeriod | "all" } {
  const allowed = ["month", "keyword", "grade", "gender", "status", "period"];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("查询参数无效。");
  const { period: selectedPeriod, ...query } = input;
  if (
    selectedPeriod !== "all" &&
    !attendancePeriods.includes(selectedPeriod as AttendancePeriod)
  )
    invalid("出勤时段无效。");
  return {
    ...parseAttendanceMonthQuery(query),
    period: selectedPeriod as AttendancePeriod | "all",
  };
}

export function parseAttendanceCellWrite(
  body: unknown,
  today = shanghaiToday(),
): AttendanceCellWrite {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("出勤请求须为JSON对象。");
  const input = body as Record<string, unknown>;
  const allowed = [
    "studentId",
    "attendanceDate",
    "period",
    "status",
    "expectedVersion",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    invalid("请求含不可写字段。");
  const attendanceDate = dateOnly(input.attendanceDate);
  if (attendanceDate < "1900-01-01") invalid("出勤日期不得早于1900-01-01。");
  const attendanceStatus = status(input.status);
  if (attendanceDate > today && attendanceStatus !== "scheduled")
    invalid("未来日期只能标记有课。");
  const expectedVersion =
    input.expectedVersion === null
      ? null
      : uint(input.expectedVersion, "版本号", true);
  return {
    studentId: positiveId(input.studentId),
    attendanceDate,
    period: period(input.period),
    status: attendanceStatus,
    expectedVersion,
  };
}

export function attendanceMonthRange(value: string) {
  const [yearText = "", monthText = ""] = value.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const next =
    monthNumber === 12
      ? `${String(year + 1).padStart(4, "0")}-01-01`
      : `${String(year).padStart(4, "0")}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { start: value + "-01", end: next };
}
