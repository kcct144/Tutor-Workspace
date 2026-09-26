import { authenticateAccount } from "../../db/auth-accounts.ts";
import { createBrowserSession } from "../../db/auth-sessions.ts";
import { withDatabase } from "../../db/pool.ts";
import { sameOrigin, setBrowserSessionCookies } from "../../auth/cookies.ts";
import { ApiError, apiResponse } from "../../utils/api.ts";
import { jsonBody } from "../../utils/json-body.ts";
import { currentUserProfile } from "../../db/responsible-subjects.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    if (!sameOrigin(event))
      throw new ApiError(403, "CSRF_INVALID", "请求来源校验失败。");
    const credentials = await jsonBody(event, 2048);
    const result = await withDatabase(
      useRuntimeConfig(event).mysql,
      async (db) => {
        let tokens:
          Awaited<ReturnType<typeof createBrowserSession>> | undefined;
        const account = await authenticateAccount(
          db,
          credentials,
          async (active) => {
            tokens = await createBrowserSession(db, active.userId);
          },
        );
        if (!tokens) throw new Error("会话创建未完成。");
        return {
          account: await currentUserProfile(db, account),
          tokens,
        };
      },
    );
    setBrowserSessionCookies(
      event,
      result.tokens.sessionToken,
      result.tokens.csrfToken,
    );
    return {
      id: result.account.id,
      username: result.account.username,
      name: result.account.name,
      role: result.account.role,
      mustChangePassword: result.account.mustChangePassword,
      responsibleSubjects: result.account.responsibleSubjects,
      version: result.account.version,
    };
  }),
);
