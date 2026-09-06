export function scenarioResults(log = console.log) {
  const passed = [],
    skipped = [];
  return {
    async run(name, skipReason, action) {
      if (skipReason) {
        skipped.push(name);
        log("[SKIP] " + name + "：" + skipReason);
        return;
      }
      await action();
      passed.push(name);
      log("[PASS] " + name);
    },
    summary() {
      log("本轮执行通过：" + (passed.join("、") || "无"));
      log("本轮跳过（不计通过）：" + (skipped.join("、") || "无"));
    },
  };
}
