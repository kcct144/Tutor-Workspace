import { listAttendanceMonth } from "../../db/attendance";
import { parseAttendanceMonthQuery } from "../../db/attendance-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseAttendanceMonthQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () => listAttendanceMonth(connection, query)),
    );
  }),
);
