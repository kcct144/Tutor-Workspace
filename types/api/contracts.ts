import type { Subject } from "./subjects";

export const contractTypes = [
  "month",
  "half_year",
  "year",
  "lessons",
  "trial",
] as const;
export type ContractType = (typeof contractTypes)[number];
export const contractLabels: Record<ContractType, string> = {
  month: "月卡",
  half_year: "半年卡",
  year: "年卡",
  lessons: "按课时",
  trial: "体验合同",
};
export const contractStatuses = [
  "生效中",
  "未开始",
  "已到期",
  "已用完",
  "进行中",
  "已终止",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];
export type TrialContractStatus = "active" | "terminated";
export interface ContractWrite {
  studentId: string;
  subject: Subject;
  contractType: ContractType;
  startDate: string | null;
  endDate: string | null;
  attendedLessons: number | null;
  totalLessons: number | null;
  makeupLessons: number;
}
export interface ContractUpdate extends ContractWrite {
  id: string;
  expectedVersion: number;
}
export interface Contract extends ContractWrite {
  id: string;
  contractNo: string;
  studentName: string;
  status: ContractStatus;
  trialStatus: TrialContractStatus | null;
  version: number;
  updatedAt: string;
}
export interface ContractQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  studentId?: string;
  subject?: Subject;
  contractType?: ContractType;
  status?: ContractStatus;
}
