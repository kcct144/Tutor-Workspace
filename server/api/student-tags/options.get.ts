import { listStudentTagOptions } from "../../db/student-tags";
import { withDatabase, inTransaction } from "../../db/pool";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () =>
    withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listStudentTagOptions(db, getQuery(event))),
    ),
  ),
);
