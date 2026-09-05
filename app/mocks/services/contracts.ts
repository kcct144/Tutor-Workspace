import rawContracts from "../data/contracts.json";
import type { ContractStatus, StudentContract } from "~/types/contracts";

export const MOCK_AS_OF_DATE = "2026-09-05";
export function getContracts(): StudentContract[] {
  return structuredClone(rawContracts) as StudentContract[];
}

export function getStudentContracts(studentId: string): StudentContract[] {
  return getContracts().filter((contract) => contract.studentId === studentId);
}

export function getContractStatus(
  contract: StudentContract,
  asOfDate = MOCK_AS_OF_DATE,
): ContractStatus {
  if (contract.contractType === "lessons") {
    if (
      contract.totalLessons !== undefined &&
      (contract.attendedLessons ?? 0) >= contract.totalLessons
    ) {
      return "已用完";
    }
    if (contract.startDate && contract.startDate > asOfDate) {
      return "未开始";
    }
    return "生效中";
  }

  if (contract.startDate && contract.startDate > asOfDate) {
    return "未开始";
  }
  if (contract.endDate && contract.endDate < asOfDate) {
    return "已到期";
  }
  return "生效中";
}

export function getStudentSubjects(studentId: string): string[] {
  return Array.from(
    new Set(
      getStudentContracts(studentId)
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
        .map((contract) => contract.subject),
    ),
  );
}

export function getStudentExpiryDate(studentId: string): string | undefined {
  return getStudentContracts(studentId)
    .map((contract) => contract.endDate)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => b.localeCompare(a))[0];
}
