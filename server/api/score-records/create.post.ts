import { requireActiveAuth } from "../../auth/context";
import { createScoreRecord } from "../../db/score-records";
import { parseScoreRecordWrite } from "../../db/score-record-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseScoreRecordWrite(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        createScoreRecord(
          db,
          input,
          (await requireActiveAuth(db, event)).userId,
        ),
      ),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
