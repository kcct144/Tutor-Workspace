import type {
  AttendanceCellWrite,
  AttendanceCellClear,
  AttendanceRecord,
  AttendanceRosterQuery,
  AttendanceRosterResult,
  AttendanceTodaySummary,
} from "../../types/api/attendance";
import { apiGet, apiWrite } from "./http";

export const getAttendanceMonth = (
  query: AttendanceRosterQuery,
  signal?: AbortSignal,
) =>
  apiGet<AttendanceRosterResult>("/api/attendance/month", { ...query }, signal);

export const getAttendanceTodaySummary = (
  query: AttendanceRosterQuery & {
    period: "morning" | "afternoon" | "evening" | "all";
  },
  signal?: AbortSignal,
) =>
  apiGet<AttendanceTodaySummary>(
    "/api/attendance/today-summary",
    { ...query },
    signal,
  );

export const setAttendanceCell = (input: AttendanceCellWrite) =>
  apiWrite<AttendanceRecord>("/api/attendance/record", "PUT", input);

export const clearAttendanceCell = (input: AttendanceCellClear) =>
  apiWrite<{ cleared: true }>("/api/attendance/record", "DELETE", input);
