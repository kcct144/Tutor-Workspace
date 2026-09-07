import { subjectMaxLength, type Subject } from "../../types/api/subjects.ts";
import { ApiError } from "../utils/api.ts";

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}

/** Shared required-subject rule for contracts, task definitions, and filters. */
export function requiredSubject(value: unknown, name = "科目"): Subject {
  if (typeof value !== "string") invalid(name + "不能为空。");
  const subject = value.trim();
  if (!subject || [...subject].length > subjectMaxLength)
    invalid(name + "须为1–" + subjectMaxLength + "字符。");
  return subject;
}

/** Learning records use null for a comprehensive/general follow-up. */
export function optionalSubject(value: unknown): Subject | null {
  return value === null ? null : requiredSubject(value);
}
