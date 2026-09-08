import { apiGet, apiWrite } from "./http";
import type { Page } from "../../types/api/students";
import type {
  AssignmentQuery,
  AssignmentBatch,
  AssignmentCompletion,
  AssignmentBatchResult,
  TaskAssignment,
} from "../../types/api/task-assignments";
import type { HomeQuery, HomePage } from "../../types/api/home";
import type { OptionLoader } from "./contracts";
import { getTaskOptions } from "./tasks";
export const getAssignments = (query: AssignmentQuery, signal?: AbortSignal) =>
  apiGet<Page<TaskAssignment>>(
    "/api/task-assignments/list",
    { ...query },
    signal,
  );
export const createAssignments = (input: AssignmentBatch) =>
  apiWrite<AssignmentBatchResult>(
    "/api/task-assignments/create-batch",
    "POST",
    input,
  );
export const completeAssignment = (input: AssignmentCompletion) =>
  apiWrite<TaskAssignment>("/api/task-assignments/completion", "PATCH", input);
export const getHome = (query: HomeQuery, signal?: AbortSignal) =>
  apiGet<HomePage>("/api/home/list", { ...query }, signal);
export const loadAssignmentTasks: OptionLoader = async (query, signal) => {
  const page = await getTaskOptions(query, signal);
  return {
    ...page,
    items: page.items.map((task) => ({
      value: task.id,
      label: task.title + " · " + task.subject,
    })),
  };
};
