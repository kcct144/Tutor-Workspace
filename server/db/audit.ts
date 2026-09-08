import type { Connection } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { positiveId } from "./contracts-rules.ts";
import { executeWrite } from "./write.ts";

export const auditEntityTypes = [
  "student",
  "contract",
  "learning_record",
  "score_record",
  "attendance_record",
  "task",
  "task_assignment",
  "user_account",
] as const;
export type AuditEntityType = (typeof auditEntityTypes)[number];
type AuditPrimitive = boolean | number | string | null;
type AuditValue = AuditPrimitive | readonly AuditPrimitive[];
export type AuditSummary = Readonly<Record<string, AuditValue>>;

const forbiddenAuditKey =
  /(password|hash|token|csrf|guardian|phone|content|body)/iu;

function assertAuditSummary(
  value: AuditSummary | undefined,
  label: string,
): string | null {
  if (value === undefined) return null;
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/u.test(key) || forbiddenAuditKey.test(key))
      throw new Error(`${label}包含敏感或不允许字段。`);
    const items = Array.isArray(item) ? item : [item];
    if (
      items.some(
        (entry) =>
          !(
            entry === null ||
            typeof entry === "string" ||
            typeof entry === "number" ||
            typeof entry === "boolean"
          ) ||
          (typeof entry === "string" && entry.length > 256),
      )
    )
      throw new Error(`${label}格式无效。`);
  }
  return JSON.stringify(value);
}

export interface AuditWrite {
  requestId?: string;
  actorUserId: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  studentId?: string | null;
  before?: AuditSummary;
  after?: AuditSummary;
  metadata?: AuditSummary;
}

function requestId(value: string | undefined): string {
  const id = value ?? randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  )
    throw new Error("审计请求标识无效。");
  return id;
}

export async function writeAuditLog(
  connection: Connection,
  input: AuditWrite,
): Promise<string> {
  if (!/^[a-z][a-z0-9_.]{2,63}$/u.test(input.action))
    throw new Error("审计动作无效。");
  if (!auditEntityTypes.includes(input.entityType))
    throw new Error("审计对象无效。");
  const result = await executeWrite(
    connection,
    "INSERT INTO audit_logs (request_id,actor_user_id,action,entity_type,entity_id,student_id,before_json,after_json,metadata_json) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      requestId(input.requestId),
      positiveId(input.actorUserId),
      input.action,
      input.entityType,
      positiveId(input.entityId),
      input.studentId === undefined || input.studentId === null
        ? null
        : positiveId(input.studentId),
      assertAuditSummary(input.before, "审计前值"),
      assertAuditSummary(input.after, "审计后值"),
      assertAuditSummary(input.metadata, "审计元数据"),
    ],
  );
  return String(result.insertId);
}
