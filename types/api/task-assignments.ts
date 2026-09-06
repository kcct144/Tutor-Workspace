export type AssignmentStatus = "pending" | "completed";
export type DueState = "overdue" | "today" | "upcoming";
export interface AssignmentQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  studentId?: string;
  taskId?: string;
  subject?: string;
  status?: AssignmentStatus;
  dueState?: DueState;
}
export interface AssignmentBatch {
  taskId: string;
  studentIds: string[];
  dueDate: string;
}
export interface AssignmentCompletion {
  id: string;
  completed: boolean;
  expectedVersion: number;
}
export interface TaskAssignment {
  id: string;
  taskId: string;
  taskTitle: string;
  description: string;
  subject: string;
  studentId: string;
  studentName: string;
  status: AssignmentStatus;
  dueDate: string;
  dueState: DueState | null;
  assignedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
