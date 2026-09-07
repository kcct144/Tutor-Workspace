import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  Contract,
  ContractQuery,
  ContractWrite,
  ContractUpdate,
  TrialContractStatus,
} from "../../types/api/contracts.ts";
import type { Page } from "../../types/api/students.ts";
import { contractStatusSql, shanghaiToday } from "./contracts-rules.ts";
import { executeWrite } from "./write.ts";
import { ApiError } from "../utils/api.ts";

interface ContractRow extends RowDataPacket {
  id: string;
  contract_no: string;
  student_id: string;
  student_name: string;
  subject: string;
  contract_type: Contract["contractType"];
  trial_status: TrialContractStatus | null;
  start_date: string | null;
  end_date: string | null;
  attended_lessons: number | null;
  total_lessons: number | null;
  makeup_lessons: number;
  status: Contract["status"];
  version: number;
  updated_at: string;
}
function project(row: ContractRow): Contract {
  return {
    id: String(row.id),
    contractNo: row.contract_no,
    studentId: String(row.student_id),
    studentName: row.student_name,
    subject: row.subject,
    contractType: row.contract_type,
    trialStatus: row.trial_status,
    startDate: row.start_date,
    endDate: row.end_date,
    attendedLessons: row.attended_lessons,
    totalLessons: row.total_lessons,
    makeupLessons: row.makeup_lessons,
    status: row.status,
    version: row.version,
    updatedAt: row.updated_at.replace(" ", "T") + "Z",
  };
}
const columns =
  "c.id, c.contract_no, c.student_id, s.name AS student_name, c.subject, c.contract_type, c.trial_status, c.start_date, c.end_date, c.attended_lessons, c.total_lessons, c.makeup_lessons, c.version, c.updated_at, (" +
  contractStatusSql +
  ") AS status";
export function likeValue(value: string) {
  return "%" + value.replace(/[!%_]/g, (c) => "!" + c) + "%";
}
export function contractFilter(query: ContractQuery, today: string) {
  const clauses: string[] = [],
    values: (string | number)[] = [];
  if (query.keyword) {
    clauses.push(
      "(CONVERT(c.contract_no USING utf8mb4) LIKE ? ESCAPE '!' OR s.name LIKE ? ESCAPE '!' OR c.subject LIKE ? ESCAPE '!')",
    );
    values.push(...Array<string>(3).fill(likeValue(query.keyword)));
  }
  for (const [key, column] of [
    ["studentId", "c.student_id"],
    ["subject", "c.subject"],
    ["contractType", "c.contract_type"],
  ] as const) {
    if (query[key]) {
      clauses.push(column + " = ?");
      values.push(query[key]);
    }
  }
  if (query.status) {
    clauses.push("(" + contractStatusSql + ") = ?");
    values.push(today, today, query.status);
  }
  return {
    sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    values,
  };
}
export async function listContracts(
  connection: Connection,
  query: ContractQuery & { page: number; pageSize: number },
  today = shanghaiToday(),
): Promise<Page<Contract>> {
  const filter = contractFilter(query, today);
  const from =
    " FROM contracts c JOIN students s ON s.id = c.student_id" + filter.sql;
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total" + from,
    filter.values,
  );
  const [rows] = await connection.execute<ContractRow[]>(
    "SELECT " + columns + from + " ORDER BY c.id DESC LIMIT ? OFFSET ?",
    [
      today,
      today,
      ...filter.values,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ],
  );
  return {
    items: rows.map(project),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
export async function findContract(
  connection: Connection,
  id: string,
  today = shanghaiToday(),
): Promise<Contract> {
  const [rows] = await connection.execute<ContractRow[]>(
    "SELECT " +
      columns +
      " FROM contracts c JOIN students s ON s.id = c.student_id WHERE c.id = ? LIMIT 1",
    [today, today, id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "未找到合同。");
  return project(rows[0]);
}
export async function contractSubjects(
  connection: Connection,
  query: { page: number; pageSize: number; keyword?: string },
): Promise<Page<{ value: string }>> {
  const where = query.keyword ? " WHERE subject LIKE ? ESCAPE '!'" : "";
  const values = query.keyword ? [likeValue(query.keyword)] : [];
  const [counts] = await connection.execute<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT subject) AS total FROM contracts" + where,
    values,
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT DISTINCT subject FROM contracts" +
      where +
      " ORDER BY subject LIMIT ? OFFSET ?",
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.map((row) => ({ value: String(row.subject) })),
    total: Number(counts[0]!.total),
    page: query.page,
    pageSize: query.pageSize,
  };
}
async function requireStudent(connection: Connection, studentId: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM students WHERE id = ? LIMIT 1",
    [studentId],
  );
  if (!rows.length)
    throw new ApiError(404, "STUDENT_NOT_FOUND", "所选学生不存在。");
}
function fields(input: ContractWrite) {
  return [
    input.studentId,
    input.subject,
    input.contractType,
    input.startDate,
    input.endDate,
    input.attendedLessons,
    input.totalLessons,
    input.makeupLessons,
  ];
}
export async function createContract(
  connection: Connection,
  input: ContractWrite,
  actorId: string,
): Promise<Contract> {
  await requireStudent(connection, input.studentId);
  // Only UUID collisions are retried; connection/commit failures are never retried.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await executeWrite(
        connection,
        "INSERT INTO contracts (contract_no, student_id, subject, contract_type, trial_status, start_date, end_date, attended_lessons, total_lessons, makeup_lessons, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          randomUUID(),
          input.studentId,
          input.subject,
          input.contractType,
          input.contractType === "trial" ? "active" : null,
          input.startDate,
          input.endDate,
          input.attendedLessons,
          input.totalLessons,
          input.makeupLessons,
          actorId,
          actorId,
        ],
      );
      return await findContract(connection, String(result.insertId));
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ER_DUP_ENTRY"
      ))
        throw error;
    }
  }
  throw new ApiError(
    409,
    "CONTRACT_NUMBER_CONFLICT",
    "合同编号生成冲突，请稍后重新操作。",
  );
}
export async function updateContract(
  connection: Connection,
  input: ContractUpdate,
  actorId: string,
): Promise<Contract> {
  await requireStudent(connection, input.studentId);
  const current = await findContract(connection, input.id);
  if ((current.contractType === "trial") !== (input.contractType === "trial"))
    throw new ApiError(400, "VALIDATION_ERROR", "体验合同不能切换为其他类型。");
  const result = await executeWrite(
    connection,
    "UPDATE contracts SET student_id = ?, subject = ?, contract_type = ?, start_date = ?, end_date = ?, attended_lessons = ?, total_lessons = ?, makeup_lessons = ?, updated_by = ?, updated_at = UTC_TIMESTAMP(3), version = version + 1 WHERE id = ? AND version = ? AND version < 4294967295",
    [...fields(input), actorId, input.id, input.expectedVersion],
  );
  if (!result.affectedRows) {
    await findContract(connection, input.id);
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "合同已被修改，请保留输入并重新载入最新版本。",
    );
  }
  return findContract(connection, input.id);
}
export async function terminateTrialContract(
  connection: Connection,
  id: string,
  expectedVersion: number,
  actorId: string,
): Promise<Contract> {
  const current = await findContract(connection, id);
  if (current.contractType !== "trial")
    throw new ApiError(400, "VALIDATION_ERROR", "仅体验合同可以终止。");
  if (current.version !== expectedVersion)
    throw new ApiError(409, "VERSION_CONFLICT", "合同已被修改，请重新载入。");
  if (current.trialStatus === "terminated") return current;
  const result = await executeWrite(
    connection,
    "UPDATE contracts SET trial_status='terminated',updated_by=?,updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=? AND version=? AND trial_status='active' AND version < 4294967295",
    [actorId, id, expectedVersion],
  );
  if (!result.affectedRows)
    throw new ApiError(409, "VERSION_CONFLICT", "合同已被修改，请重新载入。");
  return findContract(connection, id);
}
export async function studentContractAggregates(
  connection: Connection,
  ids: string[],
  today = shanghaiToday(),
) {
  const result = new Map<
    string,
    { subjects: string[]; expiryDate: string | null }
  >();
  if (!ids.length) return result;
  const slots = ids.map(() => "?").join(",");
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT a.student_id, JSON_ARRAYAGG(a.subject) AS subjects, MIN(a.expiry_date) AS expiry_date FROM (SELECT c.student_id, c.subject, MIN(CASE WHEN c.contract_type <> 'lessons' THEN c.end_date END) AS expiry_date FROM contracts c WHERE c.student_id IN (" +
      slots +
      ") AND ((" +
      contractStatusSql +
      ") = '生效中' OR (" +
      contractStatusSql +
      ") = '进行中') GROUP BY c.student_id, c.subject) a GROUP BY a.student_id LIMIT ?",
    [...ids, today, today, today, today, ids.length],
  );
  for (const row of rows) {
    const subjects: string[] =
      typeof row.subjects === "string"
        ? JSON.parse(row.subjects)
        : row.subjects;
    result.set(String(row.student_id), {
      subjects: subjects.sort(),
      expiryDate: row.expiry_date ?? null,
    });
  }
  return result;
}
