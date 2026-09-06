import type {
  Page,
  StudentDetail,
  StudentListItem,
  StudentOption,
  StudentQuery,
  StudentCreate,
  StudentEditView,
  StudentUpdate,
  StudentStatusWrite,
} from "../../types/api/students";
import { apiGet, apiWrite } from "./http";

export const getStudentEdit = (id: string, signal?: AbortSignal) =>
  apiGet<StudentEditView>("/api/students/edit", { id }, signal);
export const createStudent = (input: StudentCreate) =>
  apiWrite<StudentDetail>("/api/students/create", "POST", input);
export const updateStudent = (input: StudentUpdate) =>
  apiWrite<StudentDetail>("/api/students/update", "PATCH", input);
export const updateStudentStatus = (input: StudentStatusWrite) =>
  apiWrite<StudentDetail>("/api/students/status", "PATCH", input);

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
export const getSelectedStudentOptions = (
  ids: string[],
  signal?: AbortSignal,
) =>
  apiGet<Page<StudentOption>>(
    "/api/students/options",
    { ids: ids.join(",") },
    signal,
  );
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
