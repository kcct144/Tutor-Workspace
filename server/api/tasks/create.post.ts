import { withDatabase, inTransaction } from "../../db/pool";
import { createTask } from "../../db/tasks";
import { parseTaskWrite } from "../../db/task-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseTaskWrite(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        createTask(
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
