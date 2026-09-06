import { withDatabase } from "../../db/pool";
import { findContract } from "../../db/contracts";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const id = parseStudentId(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      findContract(connection, id),
    );
  }),
);
