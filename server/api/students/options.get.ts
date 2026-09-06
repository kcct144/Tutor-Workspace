import { withDatabase, inTransaction } from "../../db/pool";
import { listStudents, studentOptionsByIds } from "../../db/students";
import {
  parseStudentQuery,
  parseStudentOptionIds,
} from "../../db/student-query";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = getQuery(event);
    if (input.ids !== undefined) {
      const ids = parseStudentOptionIds(input);
      return withDatabase(useRuntimeConfig(event).mysql, (db) =>
        studentOptionsByIds(db, ids),
      );
    }
    const query = parseStudentQuery(input, true);
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () => listStudents(connection, query, true)),
    );
  }),
);
