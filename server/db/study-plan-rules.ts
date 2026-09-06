import { ApiError } from "../utils/api.ts";
import { positiveId, uint } from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import type { PlanUpdate } from "../../types/api/study-plans.ts";
export function parsePlanQuery(query: Record<string, unknown>) {
  return parseStudentQuery(query, true);
}
export function parsePlanUpdate(body: unknown): PlanUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(400, "VALIDATION_ERROR", "正文更新须为JSON对象。");
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["id", "content", "expectedVersion"].includes(key),
    )
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "仅允许修改正文，负责人、标题和摘要不可修改。",
    );
  if (
    typeof input.content !== "string" ||
    !input.content.trim() ||
    [...input.content.trim()].length > 100000
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "正文去除首尾空白后须为1–100000字符。",
    );
  return {
    id: positiveId(input.id),
    content: input.content,
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}
