import { withDatabase } from "../../db/pool";
import { studentPlanProgress } from "../../db/study-plans";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, () =>
    withDatabase(useRuntimeConfig(event).mysql, (db) =>
      studentPlanProgress(db, parseStudentId(getQuery(event))),
    ),
  ),
);
