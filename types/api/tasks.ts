import type { Subject } from "./subjects";
import type { PlanTag } from "./study-plans";

export const taskStatuses = ["enabled", "disabled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export interface TaskWrite {
  title: string;
  subject: Subject;
  description: string;
  /** Omitted by legacy callers; null explicitly removes the current relation. */
  studyPlanId?: string | null;
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
  assignmentCount: number;
  studyPlan: PlanTag | null;
}
export interface TaskOption {
  id: string;
  title: string;
  subject: Subject;
  studyPlan: import("./study-plans").PlanTag | null;
}
export interface TaskQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  subject?: Subject;
  status?: TaskStatus;
}
