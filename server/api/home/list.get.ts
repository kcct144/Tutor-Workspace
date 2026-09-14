import { withDatabase, inTransaction } from "../../db/pool";
import { parseHomeQuery } from "../../db/assignment-rules";
import { listHome } from "../../db/home";
import { apiResponse } from "../../utils/api";
import { currentAuth } from "../../auth/context";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseHomeQuery(getQuery(event));
    const auth = currentAuth(event);
    return withDatabase(useRuntimeConfig(event).mysql, (db) =>
      inTransaction(db, () => listHome(db, query, auth)),
    );
  }),
);
