import { apiGet, apiWrite } from "./http";
import type { Page } from "../../types/api/students";
import type {
  TaskDefinition,
  TaskQuery,
  TaskWrite,
  TaskUpdate,
  TaskStatusWrite,
  TaskOption,
} from "../../types/api/tasks";
import type { OptionLoader } from "./contracts";
export const getTasks = (query: TaskQuery, signal?: AbortSignal) =>
  apiGet<Page<TaskDefinition>>("/api/tasks/list", { ...query }, signal);
export const getTask = (id: string, signal?: AbortSignal) =>
  apiGet<TaskDefinition>("/api/tasks/detail", { id }, signal);
export const createTask = (input: TaskWrite) =>
  apiWrite<TaskDefinition>("/api/tasks/create", "POST", input);
export const updateTask = (input: TaskUpdate) =>
  apiWrite<TaskDefinition>("/api/tasks/update", "PATCH", input);
export const setTaskStatus = (input: TaskStatusWrite) =>
  apiWrite<TaskDefinition>("/api/tasks/status", "PATCH", input);
export const getTaskOptions = (
  query: Pick<TaskQuery, "page" | "pageSize" | "keyword">,
  signal?: AbortSignal,
) => apiGet<Page<TaskOption>>("/api/tasks/options", { ...query }, signal);
export const loadTaskSubjects: OptionLoader = async (query, signal) => {
  const result = await apiGet<Page<{ value: string }>>(
    "/api/tasks/subjects",
    { ...query },
    signal,
  );
  return {
    ...result,
    items: result.items.map((item) => ({
      value: item.value,
      label: item.value,
    })),
  };
};
