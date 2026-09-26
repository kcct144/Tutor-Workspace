import type { StudentGrade, StudentStatus } from "./students";

export const attendanceStatuses = [
  "scheduled",
  "present",
  "sick_leave",
  "personal_leave",
  "absent",
] as const;

export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  scheduled: "有课",
  present: "出勤",
  sick_leave: "病假",
  personal_leave: "事假",
  absent: "旷课",
};

/** 紧凑月度矩阵中的视觉符号；文字名称仍用于菜单、提示和无障碍标签。 */
export const attendanceStatusSymbols: Record<AttendanceStatus, string> = {
  scheduled: "○",
  present: "✓",
  sick_leave: "✚",
  personal_leave: "◇",
  absent: "×",
};

export const attendancePeriods = ["morning", "afternoon", "evening"] as const;
export type AttendancePeriod = (typeof attendancePeriods)[number];
export const attendancePeriodLabels: Record<AttendancePeriod, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

export interface AttendanceStudent {
  id: string;
  name: string;
  grade: StudentGrade | null;
  gender: "男" | "女" | null;
  status: StudentStatus;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  attendanceDate: string;
  period: AttendancePeriod;
  status: AttendanceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRosterQuery {
  month: string;
  keyword?: string;
  grade?: StudentGrade;
  gender?: "男" | "女";
  status?: StudentStatus;
}

export interface AttendanceRosterResult {
  month: string;
  students: AttendanceStudent[];
  records: AttendanceRecord[];
  total: number;
}

export interface AttendanceCellWrite {
  studentId: string;
  attendanceDate: string;
  period: AttendancePeriod;
  status: AttendanceStatus;
  expectedVersion: number | null;
}

/** Clearing any persisted cell restores the independent empty (no-class) state. */
export interface AttendanceCellClear {
  studentId: string;
  attendanceDate: string;
  period: AttendancePeriod;
  expectedVersion: number;
}

export interface AttendanceTodaySummary {
  /** Null when the selected month does not contain today's Shanghai date. */
  date: string | null;
  counts: Record<AttendanceStatus, number>;
}
