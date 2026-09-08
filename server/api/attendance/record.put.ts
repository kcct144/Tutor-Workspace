import { requireActiveAuth } from "../../auth/context";
import { setAttendanceCell } from "../../db/attendance";
import { parseAttendanceCellWrite } from "../../db/attendance-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseAttendanceCellWrite(await jsonBody(event, 32768));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        setAttendanceCell(
          db,
          input,
          (await requireActiveAuth(db, event)).userId,
        ),
      ),
    );
    if (input.expectedVersion === null) setResponseStatus(event, 201);
    return result;
  }),
);
