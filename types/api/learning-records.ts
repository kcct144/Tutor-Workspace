export const recordCategories = ["缺", "补", "强"] as const;
export type RecordCategory = (typeof recordCategories)[number];
export interface RecordFields {
  category: RecordCategory;
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
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
}
