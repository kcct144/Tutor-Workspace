import { withDatabase, inTransaction } from "../../db/pool";
import { updatePlan } from "../../db/study-plans";
import { parsePlanUpdate } from "../../db/study-plan-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parsePlanUpdate(await jsonBody(event, 2097152));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireDevActor(db, event.context.devActorId);
        return updatePlan(db, input);
      }),
    );
  }),
);
