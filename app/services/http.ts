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
  const cookies = document.cookie.split("; ");
  for (const name of ["__Host-tws_csrf", "tws_csrf"]) {
    const entry = cookies.find((value) => value.startsWith(`${name}=`));
    if (entry) return entry.slice(name.length + 1);
  }
  return undefined;
}
export async function apiGet<T>(
  url: string,
  query: Record<string, string | number | readonly string[] | undefined>,
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
  method: "POST" | "PATCH" | "PUT" | "DELETE",
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
