import Redis from "ioredis";

let client: Redis | undefined;

/** Returns a lazily connected Redis client for server-side use. */
export function getRedisClient(): Redis {
  if (!client) {
    const config = useRuntimeConfig();
    const options = { lazyConnect: true, maxRetriesPerRequest: 1 };
    if (!config.redis.url && !config.redis.host) {
      throw createError({
        statusCode: 500,
        statusMessage: "Redis configuration is incomplete.",
      });
    }

    client = config.redis.url
      ? new Redis(config.redis.url, options)
      : new Redis({
          host: config.redis.host,
          port: Number(config.redis.port),
          password: config.redis.password || undefined,
          db: Number(config.redis.db),
          ...options,
        });
  }
  return client;
}
