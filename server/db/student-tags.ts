import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  normalizeStudentTags,
  type StudentTags,
  type StudentTagsWrite,
} from "../../types/api/student-tags.ts";
import { positiveId, uint } from "./contracts-rules.ts";
import { parseStudentQuery } from "./student-query.ts";
import { executeWrite } from "./write.ts";
import { writeAuditLog } from "./audit.ts";
import { ApiError } from "../utils/api.ts";

export function parseStudentTagsWrite(value: unknown): StudentTagsWrite {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "VALIDATION_ERROR", "标签请求须为对象。");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["id", "tags", "expectedVersion"].includes(key),
    )
  )
    throw new ApiError(400, "VALIDATION_ERROR", "请求包含不可写字段。");
  let tags: string[];
  try {
    tags = normalizeStudentTags(input.tags);
  } catch (error) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "标签无效。",
    );
  }
  return {
    id: positiveId(input.id),
    tags,
    expectedVersion: uint(input.expectedVersion, "版本号", true),
  };
}

export async function studentTagMap(db: Connection, ids: string[]) {
  const result = new Map<string, string[]>();
  if (!ids.length) return result;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT student_id,tag FROM student_tags WHERE student_id IN (${ids.map(() => "?").join(",")}) ORDER BY student_id,tag LIMIT ?`,
    [...ids, ids.length * 10],
  );
  for (const row of rows) {
    const id = String(row.student_id);
    result.set(id, [...(result.get(id) ?? []), String(row.tag)]);
  }
  return result;
}

export async function getStudentTags(
  db: Connection,
  id: string,
  locked = false,
): Promise<StudentTags> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id,version FROM students WHERE id=? LIMIT 1" +
      (locked ? " FOR UPDATE" : ""),
    [id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到学生。");
  return {
    id,
    version: Number(rows[0].version),
    tags: (await studentTagMap(db, [id])).get(id) ?? [],
  };
}

/** Caller provides the existing transaction and authenticated actor. */
export async function saveStudentTags(
  db: Connection,
  input: StudentTagsWrite,
  actorId: string,
): Promise<StudentTags> {
  const before = await getStudentTags(db, input.id, true);
  if (before.version !== input.expectedVersion)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "学生档案已更新，标签草稿已保留，请重新加载后核对。",
    );
  if (
    JSON.stringify([...before.tags].sort()) ===
    JSON.stringify([...input.tags].sort())
  )
    return before;
  if (before.version >= 4294967295)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "学生版本已达上限，标签未保存。",
    );
  await executeWrite(
    db,
    "UPDATE students SET version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND version=?",
    [input.id, input.expectedVersion],
  );
  await executeWrite(db, "DELETE FROM student_tags WHERE student_id=?", [
    input.id,
  ]);
  if (input.tags.length)
    await executeWrite(
      db,
      "INSERT INTO student_tags (student_id,tag) VALUES " +
        input.tags.map(() => "(?,?)").join(","),
      input.tags.flatMap((tag) => [input.id, tag]),
    );
  await writeAuditLog(db, {
    actorUserId: actorId,
    action: "student.tags",
    entityType: "student",
    entityId: input.id,
    studentId: input.id,
    before: { tags: before.tags },
    after: { tags: input.tags },
  });
  return getStudentTags(db, input.id);
}

export async function listStudentTagOptions(
  db: Connection,
  input: Record<string, unknown>,
) {
  const query = parseStudentQuery(input, true);
  const where = query.keyword ? " WHERE tag LIKE ? ESCAPE '!'" : "";
  const values = query.keyword
    ? ["%" + query.keyword.replace(/[!%_]/g, (char) => "!" + char) + "%"]
    : [];
  const [counts] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT tag) AS total FROM student_tags" +
      where +
      " LIMIT 1",
    values,
  );
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT DISTINCT tag FROM student_tags" +
      where +
      " ORDER BY tag LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({
      value: String(row.tag),
      label: String(row.tag),
    })),
    total: Number(counts[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}
