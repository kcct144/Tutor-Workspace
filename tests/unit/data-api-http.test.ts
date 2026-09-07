import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { apiClient } from "../../scripts/lib/data-api.mjs";

const sessionProvider = async () => ({
  baseUrl: "http://127.0.0.1:3000",
  sessionToken: "a".repeat(43),
  csrfToken: "b".repeat(43),
});

it("uses actual loopback HTTP envelopes, blocks redirects, and never retries ambiguous writes", async () => {
  let posts = 0;
  let redirected = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/redirect") {
      res.writeHead(302, { Location: "/api/redirect-target" }).end();
    } else if (req.url === "/api/redirect-target") {
      redirected++;
      res.end();
    } else if (req.method === "POST") {
      posts++;
      // A real socket loss after receipt; in-memory fixture only, no database.
      req.socket.destroy();
    } else {
      const missing =
        req.url === "/api/missing" || req.url === "/api/student-missing";
      res.writeHead(missing ? 404 : 200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          missing
            ? {
                status: "error",
                msg: "must not echo internal details",
                data: {
                  code:
                    req.url === "/api/student-missing"
                      ? "STUDENT_NOT_FOUND"
                      : "NOT_FOUND",
                },
              }
            : {
                status: "ok",
                msg: "",
                data: { items: [], total: 0, page: 1, pageSize: 8 },
              },
        ),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const request = apiClient(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      fetch,
      { sessionProvider },
    );
    await expect(request("/api/students/list")).resolves.toMatchObject({
      total: 0,
    });
    await expect(request("/api/missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "NOT_FOUND",
    });
    await expect(request("/api/student-missing")).rejects.toMatchObject({
      code: "STUDENT_NOT_FOUND",
      uncertain: false,
    });
    await expect(request("/api/redirect")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(redirected).toBe(0);
    await expect(
      request("/api/students/create", "POST", { name: "仅内存合成" }),
    ).rejects.toMatchObject({ code: "RESULT_UNKNOWN", uncertain: true });
    expect(posts).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
