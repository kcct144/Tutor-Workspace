import { withDatabase, inTransaction } from "../../db/pool";
import { terminateTrialContract } from "../../db/contracts";
import { parseTrialTermination } from "../../db/contracts-rules";
import { requireActiveAuth } from "../../auth/context";
import { apiResponse } from "../../utils/api";
import { jsonBody } from "../../utils/json-body";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseTrialTermination(await jsonBody(event, 2048));
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, async () =>
        terminateTrialContract(
          connection,
          input.id,
          input.expectedVersion,
          (await requireActiveAuth(connection, event)).userId,
        ),
      ),
    );
  }),
);
