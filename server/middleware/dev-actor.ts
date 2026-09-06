export default defineEventHandler((event) => {
  if (
    ["/api/contracts/", "/api/learning-records/"].some((path) =>
      event.path.startsWith(path),
    ) &&
    ["POST", "PATCH"].includes(event.method)
  ) {
    // Server environment only. Never use a browser header/body as identity.
    event.context.devActorId = process.env.DEV_ACTOR_ID;
  }
});
