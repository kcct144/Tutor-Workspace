import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseScoreRecordQuery,
  parseScoreRecordSubjectQuery,
  parseScoreRecordWrite,
} from "../../server/db/score-record-rules";
import {
  projectScoreRecord,
  scoreRecordFilter,
} from "../../server/db/score-records";
import {
  parseAuditScoreRecordMigration,
  parseScoreRecordsMigration,
} from "../../server/db/safety";
import { auditEntityTypes } from "../../server/db/audit";

const fields = {
  studentId: "1",
  examDate: "2026-09-08",
  subject: "英语",
  type: "quiz",
  examName: "单元小测",
  score: "87.5",
  fullScore: "100",
};

describe("S9 score-record rules", () => {
  it("accepts exact decimal boundaries and the two confirmed record types", () => {
    expect(parseScoreRecordWrite(fields, false, "2026-09-08")).toMatchObject(
      fields,
    );
    expect(
      parseScoreRecordWrite(
        { ...fields, type: "exam", score: "0", fullScore: "0.01" },
        false,
        "2026-09-08",
      ).type,
    ).toBe("exam");
    expect(
      parseScoreRecordWrite(
        { ...fields, examDate: "1900-01-01", score: "100", fullScore: "100" },
        false,
        "2026-09-08",
      ).score,
    ).toBe("100");
  });

  it("rejects future dates, unsupported fields, illegal score forms and ranges", () => {
    for (const patch of [
      { examDate: "2026-09-09" },
      { examDate: "1899-12-31" },
      { type: "mock" },
      { subject: " " },
      { subject: "科".repeat(65) },
      { examName: " " },
      { examName: "考".repeat(161) },
      { score: "-1" },
      { score: "1.234" },
      { score: "1e2" },
      { score: "100.01", fullScore: "100" },
      { fullScore: "0" },
      { actorId: "1" },
      { scoreRate: "87.5" },
    ])
      expect(() =>
        parseScoreRecordWrite({ ...fields, ...patch }, false, "2026-09-08"),
      ).toThrow();
    expect(() =>
      parseScoreRecordWrite(
        { ...fields, id: "1", expectedVersion: 1, version: 1 },
        true,
        "2026-09-08",
      ),
    ).toThrow();
  });

  it("uses bounded paging and parameterized literal filters", () => {
    expect(parseScoreRecordQuery({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(parseScoreRecordSubjectQuery({})).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { type: "other" },
      { studentId: "0" },
      { dateFrom: "2026-09-09", dateTo: "2026-09-08" },
      { type: "quiz", sortBy: "id" },
    ])
      expect(() => parseScoreRecordQuery(query)).toThrow();
    const filter = scoreRecordFilter({
      keyword: "%'_!",
      studentId: "1",
      subject: "英语",
      type: "quiz",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-08",
    });
    expect(filter.values).toEqual([
      "%!%'!_!!%",
      "%!%'!_!!%",
      "1",
      "英语",
      "quiz",
      "2026-09-01",
      "2026-09-08",
    ]);
    expect(filter.sql).not.toContain("%'_!");
  });

  it("projects a server-derived score rate without a persisted DTO input", () => {
    expect(
      projectScoreRecord({
        id: "1",
        student_id: "2",
        student_name: "学生",
        exam_date: "2026-09-08",
        subject: "英语",
        record_type: "quiz",
        exam_name: "小测",
        score: "87.50",
        full_score: "100.00",
        score_rate: "87.50",
        created_at: "2026-09-08 01:00:00.000",
        updated_at: "2026-09-08 02:00:00.000",
        version: 1,
      } as never),
    ).toMatchObject({
      score: "87.50",
      fullScore: "100.00",
      scoreRate: "87.50",
      createdAt: "2026-09-08T01:00:00.000Z",
    });
  });
});

describe("S9 migration and audit boundaries", () => {
  it("accepts only the approved score and audit migrations", () => {
    const scoreSql = readFileSync(
      "database/migrations/013_score_records.sql",
      "utf8",
    );
    const auditSql = readFileSync(
      "database/migrations/014_audit_score_record.sql",
      "utf8",
    );
    expect(parseScoreRecordsMigration(scoreSql)).toHaveLength(1);
    expect(parseAuditScoreRecordMigration(auditSql)).toHaveLength(1);
    expect(() => parseScoreRecordsMigration(scoreSql + " SELECT 1;")).toThrow();
    expect(() =>
      parseAuditScoreRecordMigration(auditSql.replace("score_record", "other")),
    ).toThrow();
  });

  it("allows the score-record audit entity and no browser-supplied audit field", () => {
    expect(auditEntityTypes).toContain("score_record");
    expect(auditEntityTypes).not.toContain("score_rate");
  });
});
