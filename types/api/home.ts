import type { Page, StudentGrade } from "./students";
import type { TaskAssignment } from "./task-assignments";
export interface HomeQuery {
  page?: number;
  pageSize?: number;
  grade?: StudentGrade;
}
export interface HomeStudent {
  id: string;
  name: string;
  grade: StudentGrade;
  school: string | null;
  status: "在读";
  subjects: string[];
  expiryDate: string | null;
  expiresInDays: number | null;
  plans: { id: string; title: string }[];
  pendingTasks: TaskAssignment[];
  completedTasks: TaskAssignment[];
  pendingCount: number;
  completedCount: number;
  pendingRemaining: number;
  completedRemaining: number;
}
export interface HomePage extends Page<HomeStudent> {
  activeStudents: number;
  asOfDate: string;
}
