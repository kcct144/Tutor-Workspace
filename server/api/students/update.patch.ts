import { withDatabase, inTransaction } from "../../db/pool";
import { updateStudent } from "../../db/student-profile";
import { parseStudentUpdate } from "../../db/student-profile-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseStudentUpdate(await jsonBody(event, 16384));
    const result = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () => {
        await requireDevActor(db, event.context.devActorId);
        return updateStudent(db, input);
      }),
    );

    return result;
  }),
);
