import { withDatabase } from "../../db/pool";
import { findPlan } from "../../db/study-plans";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const id = parseStudentId(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      findPlan(db, id),
    );
  }),
);
