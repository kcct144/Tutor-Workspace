import { withDatabase, inTransaction } from "../../db/pool";
import { createRecord } from "../../db/learning-records";
import { parseRecordWrite } from "../../db/learning-record-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseRecordWrite(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        createRecord(
          db,
          input,
          await requireDevActor(db, event.context.devActorId),
        ),
      ),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
