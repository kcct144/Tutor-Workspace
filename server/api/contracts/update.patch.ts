import { withDatabase, inTransaction } from "../../db/pool";
import { updateContract } from "../../db/contracts";
import { parseContractWrite } from "../../db/contracts-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { contractBody } from "../../utils/contract-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseContractWrite(await contractBody(event), true);
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, async () =>
        updateContract(
          connection,
          input,
          await requireDevActor(connection, event.context.devActorId),
        ),
      ),
    );
  }),
);
