export const contractTypes = ["month", "half_year", "year", "lessons"] as const;
export type ContractType = (typeof contractTypes)[number];
export const contractLabels: Record<ContractType, string> = {
  month: "月卡",
  half_year: "半年卡",
  year: "年卡",
  lessons: "按课时",
};
export const contractStatuses = [
  "生效中",
  "未开始",
  "已到期",
  "已用完",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];
export interface ContractWrite {
  studentId: string;
  subject: string;
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
  version: number;
  updatedAt: string;
}
export interface ContractQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  studentId?: string;
  subject?: string;
  contractType?: ContractType;
  status?: ContractStatus;
}
