import { getStudentTags } from "../../db/student-tags";
import { parseStudentId } from "../../db/student-query";
import { withDatabase, inTransaction } from "../../db/pool";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const id = parseStudentId(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => getStudentTags(db, id)),
    );
  }),
);
