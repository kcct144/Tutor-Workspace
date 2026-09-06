import {
  studentGrades,
  type StudentProfileFields,
} from "../../types/api/students";

export type ProfileDraft = Omit<StudentProfileFields, "grade"> & {
  grade: StudentProfileFields["grade"] | undefined;
};
export function profileToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
// UX only: the server independently validates fields and its own current date.
export function validateProfile(draft: ProfileDraft, today = profileToday()) {
  const errors: Partial<Record<keyof StudentProfileFields, string>> = {};
  for (const [field, max, label] of [
    ["name", 64, "姓名"],
    ["school", 128, "学校"],
    ["className", 32, "班级"],
    ["guardianName", 64, "监护人姓名"],
    ["guardianPhone", 32, "联系方式"],
    ["note", 500, "备注"],
  ] as const) {
    if ([...(draft[field]?.trim() ?? "")].length > max)
      errors[field] = `${label}不能超过${max}个字符。`;
  }
  if (!draft.name.trim()) errors.name = "请输入学生姓名。";
  if (!studentGrades.some((grade) => grade === draft.grade))
    errors.grade = "请选择有效年级。";
  if (draft.gender !== null && draft.gender !== "男" && draft.gender !== "女")
    errors.gender = "请选择有效性别。";
  const phone = draft.guardianPhone?.trim();
  if (
    phone &&
    (!/^[0-9 +()-]+$/.test(phone) || (phone.match(/\d/g)?.length ?? 0) < 6)
  )
    errors.guardianPhone =
      "联系方式仅允许数字、空格、+、()、-，且至少6位数字。";
  const date = draft.enrolledAt;
  if (date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      date < "1900-01-01" ||
      date > today
    )
      errors.enrolledAt =
        "入学日期须为1900-01-01至今天的有效日期（以服务端为准）。";
  }
  return errors;
}
