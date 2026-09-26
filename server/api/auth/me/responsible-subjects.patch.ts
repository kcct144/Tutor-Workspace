import { requireActiveAuth } from "../../../auth/context.ts";
import { inTransaction, withDatabase } from "../../../db/pool.ts";
import {
  parseResponsibleSubjectsUpdate,
  replaceResponsibleSubjects,
} from "../../../db/responsible-subjects.ts";
import { apiResponse } from "../../../utils/api.ts";
import { jsonBody } from "../../../utils/json-body.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseResponsibleSubjectsUpdate(await jsonBody(event, 32768));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, async () =>
        replaceResponsibleSubjects(
          connection,
          await requireActiveAuth(connection, event),
          input,
        ),
      ),
    );
  }),
);
