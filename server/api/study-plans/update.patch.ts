import { withDatabase, inTransaction } from "../../db/pool";
import { updatePlan } from "../../db/study-plans";
import { parsePlanUpdate } from "../../db/study-plan-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parsePlanUpdate(await jsonBody(event, 2097152));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireActiveAuth(db, event);
        return updatePlan(db, input);
      }),
    );
  }),
);
