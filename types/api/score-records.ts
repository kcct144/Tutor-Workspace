export const scoreRecordTypes = ["quiz", "exam"] as const;
export type ScoreRecordType = (typeof scoreRecordTypes)[number];

export const scoreRecordTypeLabels: Record<ScoreRecordType, string> = {
  quiz: "小测",
  exam: "考试",
};

export interface ScoreRecordFields {
  examDate: string;
  subject: import("./subjects").Subject;
  type: ScoreRecordType;
  examName: string;
  /** Decimal strings avoid browser floating-point rounding. */
  score: string;
  fullScore: string;
}

export interface ScoreRecord extends ScoreRecordFields {
  id: string;
  studentId: string;
  studentName: string;
  /** Server-derived percentage; never persisted. */
  scoreRate: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ScoreRecordCreate extends ScoreRecordFields {
  studentId: string;
}
export interface ScoreRecordUpdate extends ScoreRecordCreate {
  id: string;
  expectedVersion: number;
}
export type ScoreRecordDraft = ScoreRecordCreate;

export interface ScoreRecordQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  studentId?: string;
  subject?: string;
  type?: ScoreRecordType;
  dateFrom?: string;
  dateTo?: string;
}

export interface ScoreStudentOption {
  id: string;
  name: string;
}
