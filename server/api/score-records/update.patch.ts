import { requireActiveAuth } from "../../auth/context";
import { updateScoreRecord } from "../../db/score-records";
import { parseScoreRecordWrite } from "../../db/score-record-rules";
import { inTransaction, withDatabase } from "../../db/pool";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseScoreRecordWrite(await jsonBody(event, 131072), true);
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        updateScoreRecord(
          db,
          input,
          (await requireActiveAuth(db, event)).userId,
        ),
      ),
    );
  }),
);
