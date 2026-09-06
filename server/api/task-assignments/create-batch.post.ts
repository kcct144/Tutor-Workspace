import { withDatabase, inTransaction } from "../../db/pool";
import { parseAssignmentBatch } from "../../db/assignment-rules";
import { createAssignmentBatch } from "../../db/task-assignments";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseAssignmentBatch(await jsonBody(event, 16384));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        createAssignmentBatch(
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
