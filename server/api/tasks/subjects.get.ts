import { withDatabase } from "../../db/pool";
import { taskSubjects } from "../../db/tasks";
import { parseTaskQuery } from "../../db/task-rules";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, () =>
    withDatabase(useRuntimeConfig(event).mysql, (db) =>
      taskSubjects(db, parseTaskQuery(getQuery(event), true)),
    ),
  ),
);
