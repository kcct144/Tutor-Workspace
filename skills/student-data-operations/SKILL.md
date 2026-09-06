---
name: student-data-operations
description: Use in the dedicated student-data conversation to safely query or maintain student records through the local Tutor-Workspace API.
---

# Student data operations

This skill is for routine student list/detail/create/update/status requests. It is not a database-admin or backend-development skill.

## Safety contract

- Read `AGENTS.md` and `docs/design/workspace-harness-guide.md` first.
- The current application has no login, role isolation, or audit trail. Use only a controlled local environment with synthetic data; do not import real student data or expose the service publicly.
- Before every session that may write, run `node scripts/db-preflight.mjs`. It must verify the current database is exactly `tutor_workspace` without printing connection values.
- Use `scripts/student-data.mjs`, which calls the local HTTP API. Do not write ad-hoc SQL or use a database client from the conversation.
- The script defaults to dry-run for writes. A mutation requires both `--apply` and `--confirm`.
- Updates and status changes require the current `expectedVersion`; on a version conflict, re-read and ask the user to review instead of overwriting.
- There is intentionally no delete command. Refuse physical deletion, clearing, cross-database work, schema changes, migrations, and seeds in this conversation.
- Guardian contact values must never be printed or copied into chat. API responses are limited to the existing masked projection.

## Commands

Set the local app endpoint when it is not port 3000:

```powershell
$env:STUDENT_DATA_BASE_URL = 'http://127.0.0.1:3001'
```

Read:

```powershell
node scripts/student-data.mjs list --keyword 张 --status 在读
node scripts/student-data.mjs get --id 12
```

Create/update/status are preview-only until explicitly confirmed:

```powershell
node scripts/student-data.mjs create --name 新同学 --grade 初一 --school 示例学校
node scripts/student-data.mjs create --name 新同学 --grade 初一 --school 示例学校 --apply --confirm
node scripts/student-data.mjs update --id 12 --expected-version 1 --name 新姓名 --grade 初二 --apply --confirm
node scripts/student-data.mjs status --id 12 --status 已结课 --expected-version 2 --apply --confirm
```

If create returns `STUDENT_POSSIBLE_DUPLICATE`, show the masked candidate summary and ask for a separate decision. Only then may the user repeat the command with `--confirm-possible-duplicate`, while still requiring `--apply --confirm`.

## Reporting

Report the operation, affected IDs, HTTP/API result, and verification status. Do not report raw request bodies when they contain a guardian phone, and do not claim a write succeeded unless the API returned success and the script printed the resulting safe projection.
