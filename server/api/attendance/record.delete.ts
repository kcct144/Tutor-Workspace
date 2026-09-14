import { requireActiveAuth } from "../../auth/context";
import { clearScheduledAttendanceCell } from "../../db/attendance";
import { parseAttendanceCellClear } from "../../db/attendance-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseAttendanceCellClear(await jsonBody(event, 32768));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        clearScheduledAttendanceCell(
          db,
          input,
          (await requireActiveAuth(db, event)).userId,
        ),
      ),
    );
  }),
);
