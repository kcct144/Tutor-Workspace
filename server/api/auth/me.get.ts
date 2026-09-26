import { currentAuth } from "../../auth/context.ts";
import { currentUserProfile } from "../../db/responsible-subjects.ts";
import { withDatabase } from "../../db/pool.ts";
import { apiResponse } from "../../utils/api.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const auth = currentAuth(event);
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      currentUserProfile(connection, auth),
    );
  }),
);
