import { withDatabase, inTransaction } from "../../db/pool";
import { createContract } from "../../db/contracts";
import { parseContractWrite } from "../../db/contracts-rules";
import { requireDevActor } from "../../db/dev-actor";
import { apiResponse } from "../../utils/api";
import { contractBody } from "../../utils/contract-body";
export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const input = parseContractWrite(await contractBody(event));
    const result = await withDatabase(
      useRuntimeConfig(event).mysql,
      (connection) =>
        inTransaction(connection, async () =>
          createContract(
            connection,
            input,
            await requireDevActor(connection, event.context.devActorId),
          ),
        ),
    );
    setResponseStatus(event, 201);
    return result;
  }),
);
