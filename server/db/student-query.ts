import {
  studentGrades,
  studentStatuses,
  type StudentQuery,
} from "../../types/api/students.ts";
import { ApiError } from "../utils/api.ts";

function invalid() {
  return new ApiError(400, "VALIDATION_ERROR", "查询参数无效。");
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || [...value].length > max) throw invalid();
  return value.trim();
}
function integer(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  const source = text(value, 16);
  if (!/^[1-9]\d*$/.test(source)) throw invalid();
  const number = Number(source);
  if (!Number.isSafeInteger(number) || number > max) throw invalid();
  return number;
}
export function parseStudentQuery(
  query: Record<string, unknown>,
  options = false,
): Required<Pick<StudentQuery, "page" | "pageSize">> & StudentQuery {
  const allowed = options
    ? ["page", "pageSize", "keyword"]
    : ["page", "pageSize", "keyword", "grade", "status"];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid();
  const page = integer(query.page, 1, 1000000000);
  const pageSize = integer(query.pageSize, options ? 20 : 8, 100);
  const keyword =
    query.keyword === undefined ? undefined : text(query.keyword, 64);
  const grade = query.grade === undefined ? undefined : text(query.grade, 16);
  const status =
    query.status === undefined ? undefined : text(query.status, 16);
  if (grade !== undefined && !studentGrades.some((item) => item === grade))
    throw invalid();
  if (status !== undefined && !studentStatuses.some((item) => item === status))
    throw invalid();
  return {
    page,
    pageSize,
    keyword,
    grade: grade as StudentQuery["grade"],
    status: status as StudentQuery["status"],
  };
}
export function parseStudentId(query: Record<string, unknown>): string {
  if (Object.keys(query).some((key) => key !== "id")) throw invalid();
  const id = text(query.id, 20);
  if (!/^[1-9]\d*$/.test(id) || BigInt(id) > BigInt("18446744073709551615"))
    throw invalid();
  return id;
}
export function studentFilter(query: StudentQuery) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (query.keyword) {
    clauses.push("s.name LIKE ? ESCAPE '!'");
    values.push(
      "%" + query.keyword.replace(/[!%_]/g, (char) => "!" + char) + "%",
    );
  }
  if (query.grade) {
    clauses.push("s.grade = ?");
    values.push(query.grade);
  }
  if (query.status) {
    clauses.push("s.status = ?");
    values.push(query.status);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}
