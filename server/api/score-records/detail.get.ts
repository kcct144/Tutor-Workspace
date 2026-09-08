import { withDatabase } from "../../db/pool";
import { findScoreRecord } from "../../db/score-records";
import { positiveId } from "../../db/contracts-rules";
import { ApiError, apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, () => {
    const query = getQuery(event);
    if (Object.keys(query).some((key) => key !== "id"))
      throw new ApiError(400, "VALIDATION_ERROR", "查询参数无效。");
    const id = positiveId(query.id);
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      findScoreRecord(connection, id),
    );
  }),
);
