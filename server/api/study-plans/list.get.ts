import { withDatabase, inTransaction } from "../../db/pool";
import { listPlans } from "../../db/study-plans";
import { parsePlanQuery } from "../../db/study-plan-rules";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parsePlanQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listPlans(db, query)),
    );
  }),
);
