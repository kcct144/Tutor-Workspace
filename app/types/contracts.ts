export type ContractType = "month" | "half_year" | "year" | "lessons";
export type ContractStatus = "生效中" | "未开始" | "已到期" | "已用完";

export interface StudentContract {
  id: string;
  studentId: string;
  subject: string;
  contractType: ContractType;
  startDate?: string;
  endDate?: string;
  attendedLessons?: number;
  totalLessons?: number;
  makeupLessons: number;
}
