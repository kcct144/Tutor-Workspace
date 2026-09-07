import {
  studentGrades,
  studentStatuses,
  type StudentProfileFields,
  type StudentCreate,
  type StudentUpdate,
  type StudentStatusWrite,
} from "../../types/api/students.ts";
import { ApiError } from "../utils/api.ts";
import {
  positiveId,
  uint,
  dateOnly,
  shanghaiToday,
} from "./contracts-rules.ts";

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
function object(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("请提交有效档案对象。");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !fields.includes(key)))
    invalid("请求包含不可写字段。");
  return input;
}
const fields = [
  "name",
  "grade",
  "school",
  "className",
  "gender",
  "enrolledAt",
  "guardianName",
  "guardianPhone",
  "note",
];
function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
): string | null {
  if (value === undefined || value === null) {
    if (required) invalid("请输入" + label + "。");
    return null;
  }
  if (typeof value !== "string") invalid(label + "格式无效。");
  const trimmed = value.trim();
  if ([...trimmed].length > max) invalid(label + "不能超过" + max + "个字符。");
  if (!trimmed && required) invalid("请输入" + label + "。");
  return trimmed || null;
}
function profile(
  input: Record<string, unknown>,
  today: string,
): StudentProfileFields {
  const name = text(input.name, 64, "学生姓名", true)!;
  const grade = input.grade ?? null;
  if (grade !== null && !studentGrades.some((v) => v === grade))
    invalid("请选择有效年级。");
  const gender = input.gender ?? null;
  if (gender !== null && gender !== "男" && gender !== "女")
    invalid("性别取值无效。");
  const enrolledAt =
    input.enrolledAt === undefined ||
    input.enrolledAt === null ||
    input.enrolledAt === ""
      ? null
      : dateOnly(input.enrolledAt);
  if (enrolledAt && (enrolledAt < "1900-01-01" || enrolledAt > today))
    invalid("入学日期须在1900-01-01至今天之间。");
  const guardianPhone = text(input.guardianPhone, 32, "联系方式");
  if (
    guardianPhone &&
    (!/^[0-9 +()-]+$/.test(guardianPhone) ||
      (guardianPhone.match(/\d/g)?.length ?? 0) < 6)
  )
    invalid("联系方式格式不正确。");
  return {
    name,
    grade: grade as StudentProfileFields["grade"],
    gender,
    enrolledAt,
    guardianPhone,
    school: text(input.school, 128, "学校"),
    className: text(input.className, 32, "班级"),
    guardianName: text(input.guardianName, 64, "监护人姓名"),
    note: text(input.note, 500, "备注"),
  };
}
export function parseStudentCreate(
  value: unknown,
  today = shanghaiToday(),
): StudentProfileFields & Pick<StudentCreate, "confirmPossibleDuplicate"> {
  const input = object(value, [...fields, "confirmPossibleDuplicate"]);
  if (
    input.confirmPossibleDuplicate !== undefined &&
    typeof input.confirmPossibleDuplicate !== "boolean"
  )
    invalid("重复确认参数无效。");
  return {
    ...profile(input, today),
    confirmPossibleDuplicate: input.confirmPossibleDuplicate as
      boolean | undefined,
  };
}
export function parseStudentUpdate(
  value: unknown,
  today = shanghaiToday(),
): StudentUpdate {
  const input = object(value, [...fields, "id", "expectedVersion"]);
  return {
    ...profile(input, today),
    id: positiveId(input.id),
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}
export function parseStudentStatus(value: unknown): StudentStatusWrite {
  const input = object(value, ["id", "status", "expectedVersion"]);
  if (!studentStatuses.some((v) => v === input.status))
    invalid("学生状态无效。");
  return {
    id: positiveId(input.id),
    expectedVersion: uint(input.expectedVersion, "版本号", true),
    status: input.status as StudentStatusWrite["status"],
  };
}
export function maskGuardianPhone(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{11}$/.test(value))
    return value.slice(0, 3) + "****" + value.slice(-4);
  const chars = [...value];
  if (chars.length < 5) return "*";
  return (
    chars.slice(0, 2).join("") +
    "*".repeat(chars.length - 4) +
    chars.slice(-2).join("")
  );
}
