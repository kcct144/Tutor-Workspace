import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  StudentEditView,
  StudentProfileFields,
  StudentCreate,
  StudentUpdate,
  StudentStatusWrite,
  StudentDuplicateCandidate,
} from "../../types/api/students.ts";
import { ApiError, StudentDuplicateError } from "../utils/api.ts";
import { executeWrite } from "./write.ts";
import { findStudent } from "./students.ts";

interface EditRow extends RowDataPacket {
  id: string;
  name: string;
  grade: StudentEditView["grade"];
  school: string | null;
  class_name: string | null;
  gender: StudentEditView["gender"];
  enrolled_at: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  note: string | null;
  version: number;
}
export async function findStudentEdit(
  db: Connection,
  id: string,
): Promise<StudentEditView> {
  const [rows] = await db.execute<EditRow[]>(
    "SELECT id,name,grade,school,class_name,gender,enrolled_at,guardian_name,guardian_phone,note,version FROM students WHERE id=? LIMIT 1",
    [id],
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, "NOT_FOUND", "未找到学生。");
  return {
    id: String(row.id),
    name: row.name,
    grade: row.grade,
    school: row.school,
    className: row.class_name,
    gender: row.gender,
    enrolledAt: row.enrolled_at,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    note: row.note,
    version: row.version,
  };
}
function values(input: StudentProfileFields) {
  return [
    input.name,
    input.grade,
    input.school,
    input.className,
    input.gender,
    input.enrolledAt,
    input.guardianName,
    input.guardianPhone,
    input.note,
  ];
}
export async function createStudent(
  db: Connection,
  input: StudentProfileFields & Pick<StudentCreate, "confirmPossibleDuplicate">,
) {
  if (input.school && input.className) {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT id,name,school,class_name,status FROM students WHERE BINARY name=BINARY ? AND BINARY school=BINARY ? AND BINARY class_name=BINARY ? ORDER BY id LIMIT 5",
      [input.name, input.school, input.className],
    );
    if (rows.length && !input.confirmPossibleDuplicate)
      throw new StudentDuplicateError(
        rows.map(
          (row) =>
            ({
              id: String(row.id),
              name: row.name,
              school: row.school,
              className: row.class_name,
              status: row.status,
            }) as StudentDuplicateCandidate,
        ),
      );
  }
  const result = await executeWrite(
    db,
    "INSERT INTO students (name,grade,school,class_name,gender,enrolled_at,guardian_name,guardian_phone,note,status,owner_user_id,version) VALUES (?,?,?,?,?,?,?,?,?,'待分配',NULL,1)",
    values(input),
  );
  return findStudent(db, String(result.insertId));
}
export async function updateStudent(
  db: Connection,
  input: StudentUpdate | StudentStatusWrite,
) {
  // Current locking read avoids stale RR snapshots, including status no-ops.
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id,status,version FROM students WHERE id=? LIMIT 1 FOR UPDATE",
    [input.id],
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, "NOT_FOUND", "未找到学生。");
  const conflict = () =>
    new ApiError(
      409,
      "VERSION_CONFLICT",
      "档案已被其他窗口更新或版本已达上限；草稿已保留，请明确重新加载后核对。",
    );
  if (row.version !== input.expectedVersion) throw conflict();
  if ("status" in input && input.status === row.status)
    return findStudent(db, input.id, true);
  if (row.version >= 4294967295) throw conflict();
  const full = "name" in input;
  const result = await executeWrite(
    db,
    "UPDATE students SET " +
      (full
        ? "name=?,grade=?,school=?,class_name=?,gender=?,enrolled_at=?,guardian_name=?,guardian_phone=?,note=?"
        : "status=?") +
      ",version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND version=? AND version<4294967295",
    [
      ...(full ? values(input) : [input.status]),
      input.id,
      input.expectedVersion,
    ],
  );
  if (!result.affectedRows) throw conflict();
  return findStudent(db, input.id);
}
