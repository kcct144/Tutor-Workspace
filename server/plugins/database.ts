import { closeMysqlPool } from "../db/pool";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("close", closeMysqlPool);
});
