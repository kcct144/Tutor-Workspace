import { withDatabase } from "../../db/pool";
import { findTask } from "../../db/tasks";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, () =>
    withDatabase(useRuntimeConfig(event).mysql, (db) =>
      findTask(db, parseStudentId(getQuery(event))),
    ),
  ),
);
