export default defineEventHandler((event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  return {
    status: "ok",
    msg: "成功",
    data: { app: "ok" },
  };
});
