import { parseStudentTagsWrite, saveStudentTags } from "../../db/student-tags";
import { requireActiveAuth } from "../../auth/context";
import { withDatabase, inTransaction } from "../../db/pool";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseStudentTagsWrite(await jsonBody(event, 16384));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, async () =>
        saveStudentTags(db, input, (await requireActiveAuth(db, event)).userId),
      ),
    );
  }),
);
