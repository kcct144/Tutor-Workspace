import type {
  ScoreRecord,
  ScoreRecordCreate,
  ScoreRecordQuery,
  ScoreRecordUpdate,
} from "../../types/api/score-records";
import type { Page } from "../../types/api/students";
import { apiGet, apiWrite, ServiceError } from "./http";

export const getScoreRecords = (
  query: ScoreRecordQuery,
  signal?: AbortSignal,
) => apiGet<Page<ScoreRecord>>("/api/score-records/list", { ...query }, signal);

export const getScoreRecord = (id: string, signal?: AbortSignal) =>
  apiGet<ScoreRecord>("/api/score-records/detail", { id }, signal);

export const createScoreRecord = (input: ScoreRecordCreate) =>
  apiWrite<ScoreRecord>("/api/score-records/create", "POST", input);

export const updateScoreRecord = (input: ScoreRecordUpdate) =>
  apiWrite<ScoreRecord>("/api/score-records/update", "PATCH", input);

export async function reloadScoreRecord(id: string, signal: AbortSignal) {
  try {
    return await getScoreRecord(id, signal);
  } catch (error) {
    if (error instanceof ServiceError && error.statusCode === 404)
      throw new ServiceError("成绩记录已不存在。", 404);
    throw error;
  }
}
