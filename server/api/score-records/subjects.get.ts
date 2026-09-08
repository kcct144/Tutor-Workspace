import { withDatabase, inTransaction } from "../../db/pool";
import { scoreRecordSubjects } from "../../db/score-records";
import { parseScoreRecordSubjectQuery } from "../../db/score-record-rules";
import { apiResponse } from "../../utils/api";

export default defineEventHandler((event) =>
  apiResponse(event, async () => {
    const parsed = parseScoreRecordSubjectQuery(getQuery(event));
    const { page, pageSize, keyword } = parsed;
    return withDatabase(useRuntimeConfig(event).mysql, (connection) =>
      inTransaction(connection, () =>
        scoreRecordSubjects(connection, { page, pageSize, keyword }),
      ),
    );
  }),
);
