import { withDatabase, inTransaction } from "../../db/pool";
import { updateTask } from "../../db/tasks";
import { parseTaskUpdate } from "../../db/task-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseTaskUpdate(await jsonBody(event, 131072));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        updateTask(
          db,
          input,
          await requireDevActor(db, event.context.devActorId),
        ),
      ),
    );
    return result;
  }),
);
