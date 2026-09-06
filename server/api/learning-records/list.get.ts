import { withDatabase, inTransaction } from "../../db/pool";
import { listRecords } from "../../db/learning-records";
import { parseRecordQuery } from "../../db/learning-record-rules";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseRecordQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listRecords(db, query)),
    );
  }),
);
