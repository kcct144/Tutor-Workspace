import { withDatabase, inTransaction } from "../../db/pool";
import { parseHomeQuery } from "../../db/assignment-rules";
import { listHome } from "../../db/home";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseHomeQuery(getQuery(event));
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listHome(db, query)),
    );
  }),
);
