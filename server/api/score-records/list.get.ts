import { withDatabase, inTransaction } from "../../db/pool";
import { listScoreRecords } from "../../db/score-records";
import { parseScoreRecordQuery } from "../../db/score-record-rules";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseScoreRecordQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () => listScoreRecords(connection, query)),
    );
  }),
);
