import type { H3Event } from "h3";
import type { ApiResponse } from "../../types/api/students";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function apiResponse<T>(
  event: H3Event,
  action: () => Promise<T>,
): Promise<ApiResponse<T>> {
  setResponseHeader(event, "Cache-Control", "no-store");
  try {
    return { status: "ok", msg: "成功", data: await action() };
  } catch (error) {
    const safe =
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "STORAGE_UNAVAILABLE",
            "数据服务暂不可用，请检查服务配置后重试。",
          );
    setResponseStatus(event, safe.statusCode);
    return { status: "error", msg: safe.message, data: { code: safe.code } };
  }
}
