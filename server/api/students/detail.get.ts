import { withDatabase } from "../../db/pool";
import { findStudent } from "../../db/students";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const id = parseStudentId(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      findStudent(connection, id),
    );
  }),
);
