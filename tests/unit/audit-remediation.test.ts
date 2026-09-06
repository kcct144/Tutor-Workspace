import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiResponse } from "../../server/utils/api";
import { scenarioResults } from "../integration/scenario-results.mjs";

afterEach(() => vi.unstubAllGlobals());
describe("D01 API error boundary", () => {
  it("preserves existing envelope/statuses, no-store and sanitizes unexpected errors", async () => {
    const status = vi.fn(),
      header = vi.fn();
    vi.stubGlobal("setResponseStatus", status);
    vi.stubGlobal("setResponseHeader", header);
    const event = {} as Parameters<typeof apiResponse>[0];
    expect(await apiResponse(event, async () => ({ id: "1" }))).toEqual({
      status: "ok",
      msg: "成功",
      data: { id: "1" },
    });
    for (const code of [400, 404, 409, 413, 503]) {
      const response = await apiResponse(event, async () => {
        throw new ApiError(code, "EXPECTED", "安全错误");
      });
      expect(status).toHaveBeenLastCalledWith(event, code);
      expect(response).toEqual({
        status: "error",
        msg: "安全错误",
        data: { code: "EXPECTED" },
      });
    }
    const safe = await apiResponse(event, async () => {
      throw new Error("private sql stack");
    });
    expect(JSON.stringify(safe)).not.toMatch(/private|sql|stack/);
    expect(status).toHaveBeenLastCalledWith(event, 503);
    expect(header).toHaveBeenLastCalledWith(event, "Cache-Control", "no-store");
  });
});
describe("D04 truthful scenario reporting", () => {
  it("never executes skipped scenarios or counts them as passed", async () => {
    const log = vi.fn(),
      action = vi.fn(),
      results = scenarioResults(log);
    await results.run("首次创建", "固定样例已存在", action);
    await results.run("完成写入", "本轮只读", action);
    await results.run("聚合", "", async () => {});
    results.summary();
    expect(action).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("本轮执行通过：聚合");
    expect(log).toHaveBeenCalledWith(
      "本轮跳过（不计通过）：首次创建、完成写入",
    );
  });
  it("reports actual creation/completion success but not failed actions", async () => {
    const log = vi.fn(),
      results = scenarioResults(log);
    await results.run("首次创建", "", async () => {});
    await results.run("完成/恢复", "", async () => {});
    await expect(
      results.run("失败", "", async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow();
    results.summary();
    expect(log).toHaveBeenCalledWith("本轮执行通过：首次创建、完成/恢复");
    expect(log).not.toHaveBeenCalledWith("[PASS] 失败");
  });
});
