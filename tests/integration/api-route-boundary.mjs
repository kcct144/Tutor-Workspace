import assert from "node:assert/strict";
const base = new URL(process.env.AUDIT_API_BASE_URL || "http://127.0.0.1:3001");
assert.ok(
  base.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
);
// Read-only probes, including method mismatches that cannot reach write handlers.
for (const [path, method, expected] of [
  ["/api/independent-audit-missing", "GET", 404],
  ["/api/tasks/create", "GET", 404],
  ["/api/tasks/update", "GET", 404],
  ["/api/independent-audit-missing", "POST", 404],
  ["/api/tasks/list", "OPTIONS", 404],
  ["/api/tasks/list", "GET", 200],
  ["/api/tasks/detail?id=18446744073709551615", "GET", 404],
  ["/api/tasks/list?page=0", "GET", 400],
]) {
  const response = await fetch(new URL(path, base), {
    method,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, expected);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const value = await response.json();
  assert.deepEqual(Object.keys(value).sort(), ["data", "msg", "status"]);
  assert.equal(value.status, expected === 200 ? "ok" : "error");
  if (expected !== 200) {
    assert.deepEqual(Object.keys(value.data), ["code"]);
    assert.ok(!/stack|SELECT|password|mysql/i.test(value.msg));
  }
  console.log(
    method + " " + path + " → " + expected + " JSON envelope / no-store",
  );
}
