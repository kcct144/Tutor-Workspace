import type { ApiResponse } from "../../types/api/students";

export class ServiceError extends Error {
  statusCode: number;
  code?: string;
  candidates?: import("../../types/api/students").StudentDuplicateCandidate[];
  constructor(
    message: string,
    statusCode: number,
    data?: {
      code: string;
      candidates?: import("../../types/api/students").StudentDuplicateCandidate[];
    },
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = data?.code;
    this.candidates = data?.candidates;
  }
}
function responseData<T>(response: {
  _data?: ApiResponse<T>;
  status: number;
}): T {
  const body = response._data;
  if (body?.status !== "ok")
    throw new ServiceError(
      body?.status === "error" ? body.msg : "请求失败，请重试。",
      response.status,
      body?.status === "error" ? body.data : undefined,
    );
  return body.data;
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
  return responseData(response);
}

export async function apiWrite<T>(
  url: string,
  method: "POST" | "PATCH",
  body: object,
): Promise<T> {
  const response = await $fetch.raw<ApiResponse<T>>(url, {
    method,
    body,
    retry: 0,
    ignoreResponseError: true,
  });
  return responseData(response);
}
