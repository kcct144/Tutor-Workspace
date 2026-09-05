import type { ApiResponse } from "../../types/api/students";

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
export async function apiGet<T>(
  url: string,
  query: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await $fetch.raw<ApiResponse<T>>(url, {
    query,
    signal,
    retry: 0,
    ignoreResponseError: true,
  });
  const body = response._data;
  if (body?.status !== "ok") {
    throw new ServiceError(
      body?.status === "error" ? body.msg : "请求失败，请重试。",
      response.status,
    );
  }
  return body.data;
}
