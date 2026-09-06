export interface PlanTag {
  id: string;
  title: string;
}
export interface PlanListItem extends PlanTag {
  summary: string | null;
  updatedAt: string;
  version: number;
}
export interface PlanDetail extends PlanListItem {
  content: string;
  createdAt: string;
  owner: { id: string; name: string };
}
export interface PlanQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}
export interface PlanUpdate {
  id: string;
  content: string;
  expectedVersion: number;
}
