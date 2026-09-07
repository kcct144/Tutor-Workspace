import { withDatabase, inTransaction } from "../../db/pool";
import { updateRecord } from "../../db/learning-records";
import { parseRecordWrite } from "../../db/learning-record-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseRecordWrite(await jsonBody(event, 131072), true);
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireActiveAuth(db, event);
        return updateRecord(db, input);
      }),
    );
  }),
);
