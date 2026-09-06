import { withDatabase, inTransaction } from "../../db/pool";
import { contractSubjects } from "../../db/contracts";
import { parseContractQuery } from "../../db/contracts-rules";
import { apiResponse } from "../../utils/api";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const query = parseContractQuery(getQuery(event), true);
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () => contractSubjects(connection, query)),
    );
  }),
);
