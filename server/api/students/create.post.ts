import { withDatabase, inTransaction } from "../../db/pool";
import { createStudent } from "../../db/student-profile";
import { parseStudentCreate } from "../../db/student-profile-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseStudentCreate(await jsonBody(event, 16384));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireActiveAuth(db, event);
        return createStudent(db, input);
      }),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
