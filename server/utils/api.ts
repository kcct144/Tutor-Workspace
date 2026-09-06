import type { H3Event } from "h3";
import type {
  ApiResponse,
  StudentDuplicateCandidate,
} from "../../types/api/students";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class StudentDuplicateError extends ApiError {
  candidates: StudentDuplicateCandidate[];
  constructor(candidates: StudentDuplicateCandidate[]) {
    super(
      409,
      "STUDENT_POSSIBLE_DUPLICATE",
      "发现姓名、学校和班级相同的学生，请核对后明确确认仍要创建。",
    );
    // Explicit projection: never serialize an arbitrary database row/error.
    this.candidates = candidates
      .slice(0, 5)
      .map(({ id, name, school, className, status }) => ({
        id,
        name,
        school,
        className,
        status,
      }));
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
    return {
      status: "error",
      msg: safe.message,
      data: {
        code: safe.code,
        ...(safe instanceof StudentDuplicateError
          ? { candidates: safe.candidates }
          : {}),
      },
    };
  }
}
