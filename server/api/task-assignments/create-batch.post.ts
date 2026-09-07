import { withDatabase, inTransaction } from "../../db/pool";
import { parseAssignmentBatch } from "../../db/assignment-rules";
import { createAssignmentBatch } from "../../db/task-assignments";
import { requireActiveAuth } from "../../auth/context";
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
          (await requireActiveAuth(db, event)).userId,
        ),
      ),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
