import { currentAuth } from "../../auth/context.ts";
import { apiResponse } from "../../utils/api.ts";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const auth = currentAuth(event);
    return {
      id: auth.userId,
      username: auth.username,
      name: auth.name,
      role: auth.role,
      mustChangePassword: auth.mustChangePassword,
    };
  }),
);
