export const studentGrades = ["初一", "初二", "初三", "高一", "高二"] as const;
export const studentStatuses = ["在读", "待分配", "已结课"] as const;
export type StudentGrade = (typeof studentGrades)[number];
export type StudentStatus = (typeof studentStatuses)[number];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface StudentQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  grade?: StudentGrade;
  status?: StudentStatus;
}
export interface StudentListItem {
  id: string;
  name: string;
  grade: StudentGrade;
  className: string | null;
  school: string | null;
  status: StudentStatus;
  subjects: string[];
  plans: { id: string; title: string }[];
  expiryDate: string | null;
  lastFollowUp: string | null;
}
export interface StudentDetail extends StudentListItem {
  gender: "男" | "女" | null;
  enrolledAt: string | null;
  createdAt: string;
  guardianName: string | null;
  guardianPhone: string | null;
  note: string | null;
  owner: { id: string; name: string } | null;
}
export interface StudentOption {
  id: string;
  name: string;
  grade: StudentGrade;
}
export type ApiResponse<T> =
  | { status: "ok"; msg: string; data: T }
  | { status: "error"; msg: string; data: { code: string } };
