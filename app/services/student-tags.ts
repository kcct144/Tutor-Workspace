import type {
  StudentTags,
  StudentTagsWrite,
} from "../../types/api/student-tags";
import type { OptionLoader } from "./contracts";
import { apiGet, apiWrite } from "./http";
export const getStudentTags = (id: string, signal?: AbortSignal) =>
  apiGet<StudentTags>("/api/students/tags", { id }, signal);
export const saveStudentTags = (input: StudentTagsWrite) =>
  apiWrite<StudentTags>("/api/students/tags", "PATCH", input);
export const loadStudentTagOptions: OptionLoader = (query, signal) =>
  apiGet("/api/student-tags/options", { ...query }, signal);
