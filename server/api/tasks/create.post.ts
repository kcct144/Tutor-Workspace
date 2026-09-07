import { withDatabase, inTransaction } from "../../db/pool";
import { createTask } from "../../db/tasks";
import { parseTaskWrite } from "../../db/task-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseTaskWrite(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        createTask(db, input, (await requireActiveAuth(db, event)).userId),
      ),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
