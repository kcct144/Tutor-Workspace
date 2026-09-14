import type { Page, StudentGrade } from "./students";
import type { TaskAssignment } from "./task-assignments";
export type HomePendingTask = Pick<
  TaskAssignment,
  "id" | "taskTitle" | "dueDate" | "dueState" | "version" | "status"
>;
export type HomeActivity = { id: string; occurredAt: string } & (
  | { type: "task_completed"; taskTitle: string }
  | {
      type: "learning_record_created";
      category: "缺" | "补" | "强";
      recordSummary: string;
    }
);
export interface HomeQuery {
  page?: number;
  pageSize?: number;
  grade?: StudentGrade;
  tag?: string;
}
export interface HomeStudent {
  tags: string[];
  id: string;
  name: string;
  grade: StudentGrade | null;
  school: string | null;
  status: "在读";
  subjects: string[];
  expiryDate: string | null;
  expiresInDays: number | null;
  plans: { id: string; title: string }[];
  pendingTasks: HomePendingTask[];
  activities: HomeActivity[];
  pendingCount: number;
  pendingRemaining: number;
}
export interface HomePage extends Page<HomeStudent> {
  activeStudents: number;
  asOfDate: string;
}
