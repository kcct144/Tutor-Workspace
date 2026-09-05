export type StudentGrade = "初一" | "初二" | "初三" | "高一" | "高二";
export type StudentStatus = "在读" | "待分配" | "已结课";

export interface StudentRecord {
  id: string;
  name: string;
  grade: StudentGrade;
  className: string;
  school: string;
  gender: "男" | "女";
  expiryDate: string;
  createdAt: string;
  guardianName: string;
  guardianPhone: string;
  note: string;
  plans: string[];
  completedTasks: number;
  totalTasks: number;
  lastFollowUp: string;
  status: StudentStatus;
}
