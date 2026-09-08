import { attendanceTodaySummary } from "../../db/attendance";
import { parseAttendanceSummaryQuery } from "../../db/attendance-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseAttendanceSummaryQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () =>
        attendanceTodaySummary(connection, query, query.period),
      ),
    );
  }),
);
