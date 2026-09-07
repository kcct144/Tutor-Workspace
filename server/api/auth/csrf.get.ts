import { currentAuth } from "../../auth/context.ts";
import { csrfCookieName } from "../../auth/cookies.ts";
import { rotateSessionCsrf } from "../../db/auth-sessions.ts";
import { withDatabase } from "../../db/pool.ts";
import { apiResponse } from "../../utils/api.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const auth = currentAuth(event);
    const csrfToken = await withDatabase(useRuntimeConfig(event).mysql, (db) =>
      rotateSessionCsrf(db, auth.sessionId),
    );
    setCookie(event, csrfCookieName, csrfToken, {
      path: "/",
      sameSite: "strict",
      secure: false,
      httpOnly: false,
      maxAge: 7 * 24 * 60 * 60,
    });
    return { rotated: true };
  }),
);
