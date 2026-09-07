import type { ApiResponse } from "../../types/api/students";
import { handleUnauthenticated } from "~/composables/useAuth";

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
function responseData<T>(
  response: {
    _data?: ApiResponse<T>;
    status: number;
  },
  suppressUnauthenticated = false,
): T {
  const body = response._data;
  if (body?.status !== "ok") {
    const error = new ServiceError(
      body?.status === "error" ? body.msg : "请求失败，请重试。",
      response.status,
      body?.status === "error" ? body.data : undefined,
    );
    if (error.statusCode === 401 && !suppressUnauthenticated)
      handleUnauthenticated();
    throw error;
  }
  return body.data;
}

function csrfToken(): string | undefined {
  if (!import.meta.client) return undefined;
  const entry = document.cookie
    .split("; ")
    .find((value) => value.startsWith("tws_csrf="));
  return entry?.slice("tws_csrf=".length);
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
    credentials: "same-origin",
  });
  return responseData(response, url === "/api/auth/me");
}

export async function apiWrite<T>(
  url: string,
  method: "POST" | "PATCH",
  body: object,
): Promise<T> {
  const token = csrfToken();
  const response = await $fetch.raw<ApiResponse<T>>(url, {
    method,
    body,
    retry: 0,
    ignoreResponseError: true,
    credentials: "same-origin",
    headers: token ? { "X-CSRF-Token": token } : undefined,
  });
  return responseData(response, url.startsWith("/api/auth/"));
}
