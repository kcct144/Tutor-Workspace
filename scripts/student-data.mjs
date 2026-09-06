const baseUrl = process.env.STUDENT_DATA_BASE_URL || "http://127.0.0.1:3000";
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

function usage() {
  console.log(`用法：
  node scripts/student-data.mjs list [--keyword 文本] [--grade 年级] [--status 状态] [--page 页码] [--page-size 数量]
  node scripts/student-data.mjs get --id 学生ID
  node scripts/student-data.mjs create --name 姓名 --grade 年级 [档案字段...] [--apply --confirm]
  node scripts/student-data.mjs update --id ID --expected-version 版本 --name 姓名 --grade 年级 [档案字段...] [--apply --confirm]
  node scripts/student-data.mjs status --id ID --status 状态 --expected-version 版本 [--apply --confirm]

写操作默认只预览；真正写入必须同时提供 --apply --confirm。
学生没有 delete 命令。`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error("参数格式无效。");
    const key = token.slice(2).replaceAll("-", "_");
    if (
      ["apply", "confirm", "json", "confirm_possible_duplicate"].includes(key)
    ) {
      values[key] = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`缺少参数：${token}`);
    values[key] = value;
    index += 1;
  }
  return { command, values };
}

function localBase() {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("STUDENT_DATA_BASE_URL 不是有效地址。");
  }
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("学生数据脚本只允许访问本机 HTTP 服务。");
  }
  return url;
}

function requireValue(values, key, label = key) {
  if (typeof values[key] !== "string" || !values[key].trim())
    throw new Error(`缺少参数：${label}`);
  return values[key].trim();
}

function positiveInteger(values, key, label) {
  const value = requireValue(values, key, label);
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label}必须是正整数。`);
  return value;
}

function profile(values) {
  const body = {
    name: requireValue(values, "name", "--name"),
    grade: requireValue(values, "grade", "--grade"),
  };
  const optional = [
    ["school", "school"],
    ["class_name", "className"],
    ["gender", "gender"],
    ["enrolled_at", "enrolledAt"],
    ["guardian_name", "guardianName"],
    ["guardian_phone", "guardianPhone"],
    ["note", "note"],
  ];
  for (const [source, target] of optional) {
    if (values[source] !== undefined) body[target] = values[source];
  }
  return body;
}

function safePreview(body) {
  const output = { ...body };
  if (Object.hasOwn(output, "guardianPhone"))
    output.guardianPhone = "[已提供，未显示]";
  return output;
}

async function request(path, options = {}) {
  const url = new URL(path, localBase());
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      "无法连接本机 Nuxt 服务，请先启动开发服务并检查 STUDENT_DATA_BASE_URL。",
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("服务返回了无法识别的响应，操作已停止。");
  }
  if (payload?.status !== "ok") {
    const code = payload?.data?.code || "UNKNOWN_ERROR";
    const message =
      typeof payload?.msg === "string" ? payload.msg : "请求失败。";
    const error = new Error(`${message} [${code}]`);
    error.code = code;
    error.data = payload?.data;
    throw error;
  }
  return payload.data;
}

function printResult(data, json) {
  if (json) {
    console.log(JSON.stringify(data));
    return;
  }
  if (Array.isArray(data?.items)) {
    console.log(
      `查询完成：${data.total} 条，第 ${data.page} 页，每页 ${data.pageSize} 条。`,
    );
    for (const item of data.items)
      console.log(
        `${item.id}\t${item.name}\t${item.grade}\t${item.status ?? ""}`,
      );
    return;
  }
  console.log(
    `操作完成：学生 ${data.id}；${data.name}；${data.grade}；${data.status ?? ""}；版本 ${data.version ?? "-"}。`,
  );
  if (data.guardianPhoneMasked)
    console.log(`联系方式：${data.guardianPhoneMasked}`);
}

function mutationGuard(values) {
  if (!values.apply || !values.confirm) return false;
  return true;
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (!command || command === "help") {
    usage();
    return;
  }
  if (command === "delete")
    throw new Error("学生不提供物理删除命令；请回到产品文档重新设计。");

  if (command === "list") {
    const params = new URLSearchParams();
    for (const [key, queryKey] of [
      ["keyword", "keyword"],
      ["grade", "grade"],
      ["status", "status"],
      ["page", "page"],
      ["page_size", "pageSize"],
    ]) {
      if (values[key] !== undefined) params.set(queryKey, values[key]);
    }
    printResult(
      await request(`/api/students/list?${params}`),
      values.json === true,
    );
    return;
  }
  if (command === "get") {
    printResult(
      await request(
        `/api/students/detail?id=${encodeURIComponent(positiveInteger(values, "id", "--id"))}`,
      ),
      values.json === true,
    );
    return;
  }

  if (!["create", "update", "status"].includes(command))
    throw new Error(
      "不支持的操作；请使用 list、get、create、update 或 status。",
    );
  if (!mutationGuard(values)) {
    const body =
      command === "status"
        ? {
            id: positiveInteger(values, "id", "--id"),
            status: requireValue(values, "status", "--status"),
            expectedVersion: positiveInteger(
              values,
              "expected_version",
              "--expected-version",
            ),
          }
        : {
            ...(command === "update"
              ? {
                  id: positiveInteger(values, "id", "--id"),
                  expectedVersion: positiveInteger(
                    values,
                    "expected_version",
                    "--expected-version",
                  ),
                }
              : {}),
            ...profile(values),
          };
    if (command === "create" && values.confirm_possible_duplicate)
      body.confirmPossibleDuplicate = true;
    console.log("仅预览，未写入数据库：");
    console.log(JSON.stringify(safePreview(body)));
    console.log("如需执行，请确认后重新提供 --apply --confirm。");
    return;
  }

  if (command === "create") {
    const body = {
      ...profile(values),
      ...(values.confirm_possible_duplicate
        ? { confirmPossibleDuplicate: true }
        : {}),
    };
    try {
      printResult(
        await request("/api/students/create", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        values.json === true,
      );
    } catch (error) {
      if (error.code === "STUDENT_POSSIBLE_DUPLICATE") {
        console.error(
          "发现可能重复学生；请核对候选后，再增加 --confirm-possible-duplicate 重试。候选摘要：",
        );
        for (const candidate of error.data?.candidates || [])
          console.error(
            `${candidate.id}\t${candidate.name}\t${candidate.school || ""}\t${candidate.className || ""}\t${candidate.status}`,
          );
      }
      throw error;
    }
    return;
  }
  if (command === "status") {
    const body = {
      id: positiveInteger(values, "id", "--id"),
      status: requireValue(values, "status", "--status"),
      expectedVersion: Number(
        positiveInteger(values, "expected_version", "--expected-version"),
      ),
    };
    printResult(
      await request("/api/students/status", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      values.json === true,
    );
    return;
  }
  const body = {
    ...profile(values),
    id: positiveInteger(values, "id", "--id"),
    expectedVersion: Number(
      positiveInteger(values, "expected_version", "--expected-version"),
    ),
  };
  printResult(
    await request("/api/students/update", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    values.json === true,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "操作失败，已停止。");
  process.exitCode = 1;
}
