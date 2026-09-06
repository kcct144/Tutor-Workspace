export type StudentGrade = "初一" | "初二" | "初三" | "高一" | "高二";
export interface HomeTask {
  id: string;
  title: string;
  completed: boolean;
}
export interface HomeStudent {
  id: string;
  name: string;
  grade: StudentGrade;
  className: string;
  expiresInDays?: number;
  plans: { id: string; title: string }[];
  subjects: string[];
  tasks: HomeTask[];
}
export interface HomeSummary {
  activeStudents: number;
}
