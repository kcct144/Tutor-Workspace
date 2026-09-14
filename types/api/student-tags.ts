export interface StudentTags {
  id: string;
  tags: string[];
  version: number;
}
export interface StudentTagsWrite {
  id: string;
  tags: string[];
  expectedVersion: number;
}

export function normalizeStudentTag(value: unknown): string {
  if (typeof value !== "string") throw new Error("标签须为文字。");
  const tag = value.normalize("NFC").trim();
  if (!tag || [...tag].length > 24 || /[\p{Cc}\p{Cf}]/u.test(tag))
    throw new Error("每个标签须为1–24个字符，不能包含控制字符。");
  return tag;
}
export function normalizeStudentTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10)
    throw new Error("每位学生最多设置10个标签。");
  return [...new Set(value.map(normalizeStudentTag))].sort();
}
