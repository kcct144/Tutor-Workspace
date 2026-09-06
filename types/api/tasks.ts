export const taskStatuses = ["enabled", "disabled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export interface TaskWrite {
  title: string;
  subject: string;
  description: string;
}
export interface TaskUpdate extends TaskWrite {
  id: string;
  status: TaskStatus;
  expectedVersion: number;
}
export interface TaskStatusWrite {
  id: string;
  status: TaskStatus;
  expectedVersion: number;
}
export interface TaskDefinition extends TaskWrite {
  id: string;
  status: TaskStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  assignmentCount: 0;
}
export interface TaskOption {
  id: string;
  title: string;
  subject: string;
}
export interface TaskQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  subject?: string;
  status?: TaskStatus;
}
