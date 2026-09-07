import { withDatabase, inTransaction } from "../../db/pool";
import { updateTask } from "../../db/tasks";
import { parseTaskStatus } from "../../db/task-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseTaskStatus(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        updateTask(db, input, (await requireActiveAuth(db, event)).userId),
      ),
    );
    return result;
  }),
);
