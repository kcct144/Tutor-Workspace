import type {
  Page,
  StudentDetail,
  StudentListItem,
  StudentOption,
  StudentQuery,
} from "../../types/api/students";
import { apiGet } from "./http";

export function getStudents(query: StudentQuery, signal?: AbortSignal) {
  return apiGet<Page<StudentListItem>>(
    "/api/students/list",
    { ...query },
    signal,
  );
}
export function getStudent(id: string, signal?: AbortSignal) {
  return apiGet<StudentDetail>("/api/students/detail", { id }, signal);
}
export function getStudentOptions(
  query: Pick<StudentQuery, "page" | "pageSize" | "keyword">,
  signal?: AbortSignal,
) {
  return apiGet<Page<StudentOption>>(
    "/api/students/options",
    { ...query },
    signal,
  );
}
