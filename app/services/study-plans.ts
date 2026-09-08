import type {
  PlanQuery,
  PlanListItem,
  PlanDetail,
  PlanUpdate,
  PlanTag,
  PlanTaskProgress,
} from "../../types/api/study-plans";
import type { Page } from "../../types/api/students";
import { apiGet, apiWrite } from "./http";
export const getPlans = (query: PlanQuery, signal?: AbortSignal) =>
  apiGet<Page<PlanListItem>>("/api/study-plans/list", { ...query }, signal);
export const getPlan = (id: string, signal?: AbortSignal) =>
  apiGet<PlanDetail>("/api/study-plans/detail", { id }, signal);
export const updatePlan = (input: PlanUpdate) =>
  apiWrite<PlanDetail>("/api/study-plans/update", "PATCH", input);
export const getPlanOptions = (
  query: Pick<PlanQuery, "page" | "pageSize" | "keyword">,
  signal?: AbortSignal,
) => apiGet<Page<PlanTag>>("/api/study-plans/options", { ...query }, signal);
export const getStudentPlanProgress = (id: string, signal?: AbortSignal) =>
  apiGet<PlanTaskProgress[]>("/api/students/plan-progress", { id }, signal);
