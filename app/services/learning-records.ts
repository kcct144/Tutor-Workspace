import type {
  LearningRecord,
  RecordCreate,
  RecordUpdate,
  RecordQuery,
} from "../../types/api/learning-records";
import type { Page } from "../../types/api/students";
import { apiGet, apiWrite, ServiceError } from "./http";
export const getRecords = (query: RecordQuery, signal?: AbortSignal) =>
  apiGet<Page<LearningRecord>>(
    "/api/learning-records/list",
    { ...query },
    signal,
  );
export const createRecord = (input: RecordCreate) =>
  apiWrite<LearningRecord>("/api/learning-records/create", "POST", input);
export const updateRecord = (input: RecordUpdate) =>
  apiWrite<LearningRecord>("/api/learning-records/update", "PATCH", input);
// Explicit conflict recovery only; normal rendering remains one bounded page.
export async function reloadRecord(
  studentId: string,
  id: string,
  signal: AbortSignal,
) {
  for (let page = 1; ; page++) {
    const result = await getRecords({ studentId, page, pageSize: 100 }, signal);
    const record = result.items.find((row) => row.id === id);
    if (record) return record;
    if (page * 100 >= result.total)
      throw new ServiceError("当前学生下未找到该记录。", 404);
  }
}
