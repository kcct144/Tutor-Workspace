# 工作区脚本

脚本是版本化的安全入口，不替代产品文档或服务端权限。

## 前置条件

1. 本机已复制并填写 `.env`，但不要把内容复制到聊天或日志。
2. Nuxt 服务仅监听回环地址，例如 `pnpm dev --host 127.0.0.1`。
3. 数据库必须是总指挥批准的 `tutor_workspace`。

## 数据库边界预检

```powershell
node scripts/db-preflight.mjs
```

该命令只读连接数据库，验证当前库并输出受控统计，不输出主机、账号、密码、SQL 参数或原始学生行。

## 学生数据操作

脚本只调用本机 HTTP API，不直接执行 SQL：

```powershell
$env:STUDENT_DATA_BASE_URL = 'http://127.0.0.1:3000'
node scripts/student-data.mjs list --page 1 --page-size 20
node scripts/student-data.mjs get --id 12
node scripts/student-data.mjs create --name 新同学 --grade 初一
node scripts/student-data.mjs update --id 12 --expected-version 1 --name 新姓名 --grade 初二
node scripts/student-data.mjs status --id 12 --status 已结课 --expected-version 2
```

`create`、`update`、`status` 默认只预览。真正写入必须同时提供 `--apply --confirm`；创建重复学生还需要单独的 `--confirm-possible-duplicate`。脚本没有 `delete` 能力，学生删除需求必须回到产品设计重新审批。

当前项目没有登录/权限/审计，脚本只允许受控开发和合成数据环境，禁止公网和真实学生数据。
