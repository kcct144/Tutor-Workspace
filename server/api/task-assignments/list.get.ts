import { withDatabase, inTransaction } from "../../db/pool";
import { parseAssignmentQuery } from "../../db/assignment-rules";
import { listAssignments } from "../../db/task-assignments";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseAssignmentQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listAssignments(db, query)),
    );
  }),
);
