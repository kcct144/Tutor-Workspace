import { currentAuth } from "../../auth/context.ts";
import { clearBrowserSessionCookies } from "../../auth/cookies.ts";
import { revokeSession } from "../../db/auth-sessions.ts";
import { withDatabase } from "../../db/pool.ts";
import { apiResponse } from "../../utils/api.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const auth = currentAuth(event);
    await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      revokeSession(db, auth.sessionId),
    );
    clearBrowserSessionCookies(event);
    return { loggedOut: true };
  }),
);
