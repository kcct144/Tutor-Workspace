import { withDatabase } from "../../db/pool";
import { findStudentEdit } from "../../db/student-profile";
import { parseStudentId } from "../../db/student-query";
import { apiResponse } from "../../utils/api";
// Controlled synthetic environment only: this separate DTO is NOT authorization.
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const id = parseStudentId(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      findStudentEdit(db, id),
    );
  }),
);
