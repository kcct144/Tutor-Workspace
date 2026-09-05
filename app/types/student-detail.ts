export type LearningRecordCategory = "缺" | "补" | "强";
export type TaskStatus = "待完成" | "已完成";

export interface LearningRecord {
  id: string;
  studentId: string;
  category: LearningRecordCategory;
  content: string;
  occurredOn: string;
  authorName: string;
}

export interface StudentTask {
  id: string;
  studentId: string;
  title: string;
  status: TaskStatus;
  dueDate: string;
}
