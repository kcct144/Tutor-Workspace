import type {
  Contract,
  ContractQuery,
  ContractWrite,
  ContractUpdate,
} from "../../types/api/contracts";
import type { Page } from "../../types/api/students";
import { apiGet, apiWrite } from "./http";
import { getStudentOptions, getSelectedStudentOptions } from "./students";

export const getContracts = (query: ContractQuery, signal?: AbortSignal) =>
  apiGet<Page<Contract>>("/api/contracts/list", { ...query }, signal);
export const getContract = (id: string, signal?: AbortSignal) =>
  apiGet<Contract>("/api/contracts/detail", { id }, signal);
export const createContract = (input: ContractWrite) =>
  apiWrite<Contract>("/api/contracts/create", "POST", input);
export const updateContract = (input: ContractUpdate) =>
  apiWrite<Contract>("/api/contracts/update", "PATCH", input);
export interface OptionQuery {
  keyword?: string;
  page: number;
  pageSize: number;
}
export interface RemoteOption {
  label: string;
  value: string;
}
export type OptionLoader = ((
  query: OptionQuery,
  signal?: AbortSignal,
) => Promise<Page<RemoteOption>>) & {
  selected?: (ids: string[], signal?: AbortSignal) => Promise<RemoteOption[]>;
};
export const loadStudentOptions: OptionLoader = async (query, signal) => {
  const page = await getStudentOptions(query, signal);
  return {
    ...page,
    items: page.items.map((student) => ({
      label: `${student.name} · ${student.grade}`,
      value: student.id,
    })),
  };
};
loadStudentOptions.selected = async (ids, signal) => {
  const page = await getSelectedStudentOptions(ids, signal);
  return page.items.map((student) => ({
    value: student.id,
    label: `${student.name} · ${student.grade}`,
  }));
};
export const loadSubjectOptions: OptionLoader = async (query, signal) => {
  const page = await apiGet<Page<{ value: string }>>(
    "/api/contracts/subjects",
    { ...query },
    signal,
  );
  return {
    ...page,
    items: page.items.map((item) => ({ label: item.value, value: item.value })),
  };
};
