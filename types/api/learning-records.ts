import type { Subject } from "./subjects";

export const recordCategories = ["缺", "补", "强"] as const;
export type RecordCategory = (typeof recordCategories)[number];
export interface RecordFields {
  category: RecordCategory;
  /** Null represents a comprehensive/general follow-up. */
  subject: Subject | null;
  content: string;
  occurredOn: string;
}
export interface RecordCreate extends RecordFields {
  studentId: string;
}
export interface RecordUpdate extends RecordFields {
  id: string;
  expectedVersion: number;
}
export interface LearningRecord extends RecordCreate {
  id: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface RecordQuery {
  studentId: string;
  page?: number;
  pageSize?: number;
  category?: RecordCategory;
  subject?: Subject;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
}
