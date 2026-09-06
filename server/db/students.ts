import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  StudentListItem,
  StudentDetail,
  StudentOption,
  StudentQuery,
  Page,
} from "../../types/api/students.ts";
import { studentFilter } from "./student-query.ts";
import { ApiError } from "../utils/api.ts";
import { studentContractAggregates } from "./contracts.ts";

interface StudentRow extends RowDataPacket {
  id: string;
  name: string;
  grade: StudentListItem["grade"];
  class_name: string | null;
  school: string | null;
  status: StudentListItem["status"];
  gender: StudentDetail["gender"];
  enrolled_at: string | null;
  created_at: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  note: string | null;
  owner_id: string | null;
  owner_name: string | null;
  last_follow_up?: string | null;
}

export function toStudentListItem(row: StudentRow): StudentListItem {
  return {
    id: String(row.id),
    name: row.name,
    grade: row.grade,
    className: row.class_name,
    school: row.school,
    status: row.status,
    subjects: [],
    plans: [],
    expiryDate: null,
    lastFollowUp: row.last_follow_up ?? null,
  };
}
export function toStudentDetail(row: StudentRow): StudentDetail {
  return {
    ...toStudentListItem(row),
    gender: row.gender,
    enrolledAt: row.enrolled_at,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    note: row.note,
    owner: row.owner_id
      ? { id: String(row.owner_id), name: row.owner_name ?? "" }
      : null,
  };
}
export async function listStudents(
  connection: PoolConnection,
  query: StudentQuery & { page: number; pageSize: number },
  options = false,
): Promise<Page<StudentListItem | StudentOption>> {
  const filter = studentFilter(query);
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM students s" + filter.sql,
    filter.values,
  );
  const columns = options
    ? "s.id, s.name, s.grade"
    : "s.id, s.name, s.grade, s.class_name, s.school, s.status, lr.last_follow_up";
  const join = options
    ? ""
    : " LEFT JOIN (SELECT student_id, MAX(occurred_on) AS last_follow_up FROM student_learning_records GROUP BY student_id) lr ON lr.student_id=s.id";
  const [rows] = await connection.execute<StudentRow[]>(
    "SELECT " +
      columns +
      " FROM students s" +
      join +
      filter.sql +
      (options
        ? " ORDER BY s.id DESC"
        : " ORDER BY lr.last_follow_up DESC, s.id DESC") +
      " LIMIT ? OFFSET ?",
    [...filter.values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const aggregates = options
    ? undefined
    : await studentContractAggregates(
        connection,
        rows.map((row) => String(row.id)),
      );
  return {
    items: options
      ? rows.map((row) => ({
          id: String(row.id),
          name: row.name,
          grade: row.grade,
        }))
      : rows.map((row) => ({
          ...toStudentListItem(row),
          ...aggregates?.get(String(row.id)),
        })),
    total: Number(counts[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}
export async function findStudent(
  connection: PoolConnection,
  id: string,
): Promise<StudentDetail> {
  const [rows] = await connection.execute<StudentRow[]>(
    "SELECT s.id, s.name, s.grade, s.class_name, s.school, s.status, s.gender, s.enrolled_at, s.created_at, s.guardian_name, s.guardian_phone, s.note, u.id AS owner_id, u.name AS owner_name, (SELECT MAX(occurred_on) FROM student_learning_records WHERE student_id=s.id) AS last_follow_up FROM students s LEFT JOIN users u ON u.id = s.owner_user_id WHERE s.id = ? LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到学生。");
  const aggregates = await studentContractAggregates(connection, [id]);
  return { ...toStudentDetail(rows[0]), ...aggregates.get(id) };
}
