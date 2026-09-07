import { withDatabase, inTransaction } from "../../db/pool";
import { parseAssignmentCompletion } from "../../db/assignment-rules";
import { completeAssignment } from "../../db/task-assignments";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseAssignmentCompletion(await jsonBody(event, 16384));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireActiveAuth(db, event);
        return completeAssignment(db, input);
      }),
    );
  }),
);
