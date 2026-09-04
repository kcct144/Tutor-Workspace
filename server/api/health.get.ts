export default defineEventHandler(() => {
  const config = useRuntimeConfig();
  return {
    status: "ok",
    services: {
      mysqlConfigured: Boolean(
        config.mysql.host && config.mysql.database && config.mysql.user,
      ),
      redisConfigured: Boolean(config.redis.url || config.redis.host),
    },
  };
});
