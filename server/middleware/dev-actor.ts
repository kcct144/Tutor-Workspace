export default defineEventHandler((event) => {
  if (
    event.path.startsWith("/api/contracts/") &&
    ["POST", "PATCH"].includes(event.method)
  ) {
    // Server environment only. Never use a browser header/body as identity.
    event.context.devActorId = process.env.DEV_ACTOR_ID;
  }
});
