import type { H3Event } from "h3";
import { getHeader, getQuery } from "h3";
import { ApiError } from "./api";

export async function contractBody(event: H3Event): Promise<unknown> {
  if (Object.keys(getQuery(event)).length)
    throw new ApiError(400, "VALIDATION_ERROR", "写请求不接受查询参数。");
  if (
    !getHeader(event, "content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(400, "VALIDATION_ERROR", "请发送JSON请求。");
  // Drain oversized requests without retaining them or exposing parser errors.
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    event.node.req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 16384) chunks.push(chunk);
      else chunks.length = 0;
    });
    event.node.req.on("end", () =>
      size > 16384
        ? reject(
            new ApiError(413, "PAYLOAD_TOO_LARGE", "合同请求超过16KiB限制。"),
          )
        : resolve(Buffer.concat(chunks)),
    );
    event.node.req.on("error", () =>
      reject(new ApiError(400, "VALIDATION_ERROR", "请求读取失败。")),
    );
    event.node.req.on("aborted", () =>
      reject(new ApiError(400, "VALIDATION_ERROR", "请求已中断。")),
    );
  });
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "JSON格式无效。");
  }
}
