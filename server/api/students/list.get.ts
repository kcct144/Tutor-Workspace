import { withDatabase, inTransaction } from "../../db/pool";
import { listStudents } from "../../db/students";
import { parseStudentQuery } from "../../db/student-query";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseStudentQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () => listStudents(connection, query)),
    );
  }),
);
