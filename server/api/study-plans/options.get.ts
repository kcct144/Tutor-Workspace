import { withDatabase } from "../../db/pool";
import { listPlanOptions } from "../../db/study-plans";
import { parsePlanQuery } from "../../db/study-plan-rules";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, () =>
    withDatabase(useRuntimeConfig(event).mysql, (db) =>
      listPlanOptions(db, parsePlanQuery(getQuery(event))),
    ),
  ),
);
