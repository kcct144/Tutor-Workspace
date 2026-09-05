export type TaskDefinitionStatus = "草稿" | "启用" | "停用";
export type TaskAssignmentStatus =
  "待完成" | "进行中" | "已完成" | "已跳过" | "已取消";

export interface TaskDefinition {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  subject: string;
  status: TaskDefinitionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  studentId: string;
  assignedBy: string;
  status: TaskAssignmentStatus;
  assignedAt: string;
  dueDate: string;
  startedAt?: string;
  completedAt?: string;
  completionNote?: string;
  updatedAt: string;
}
