export interface PlanTag {
  id: string;
  title: string;
}
export interface PlanListItem extends PlanTag {
  summary: string | null;
  updatedAt: string;
  version: number;
}
export interface PlanDetail extends PlanListItem {
  content: string;
  createdAt: string;
  owner: { id: string; name: string };
  relatedTasks: import("./tasks").TaskDefinition[];
  studentProgress: PlanStudentProgress[];
}
export interface PlanQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}
export interface PlanUpdate {
  id: string;
  content: string;
  expectedVersion: number;
}

export interface PlanTaskProgress {
  plan: PlanTag;
  completedAssignments: number;
  totalAssignments: number;
  progressPercent: number | null;
  progressState: "empty" | "active";
}

export interface PlanStudentProgress extends PlanTaskProgress {
  student: { id: string; name: string; grade: string | null };
}
