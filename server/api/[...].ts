import { ApiError, apiResponse } from "../utils/api";

// Nitro's more-specific business routes win. Catch unmatched API paths/methods
// before Nuxt's SPA renderer; do not include the requested path or internals.
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    throw new ApiError(404, "API_NOT_FOUND", "API路径或请求方法不存在。");
  }),
);
