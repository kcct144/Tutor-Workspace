---
name: student-data-operations
description: Use in the dedicated student-data conversation to safely query or maintain student records through the local Tutor-Workspace API.
---

# Student data operations

This skill is for routine student, learning-record, task, and task-assignment operations, plus contract and study-plan queries. It is not a database-admin or backend-development skill.

## Safety contract

- Read `AGENTS.md` and `docs/design/workspace-harness-guide.md` first.
- Use only the user's local, loopback-only S8.7 login session; do not expose the service publicly or share its access. `DEV_ACTOR_ID` is not an HTTP identity and cannot authorize a script.
- Before every session that may write, run `node scripts/db-preflight.mjs`. It must verify the current database is exactly `tutor_workspace` without printing connection values.
- Use the versioned scripts in `scripts/`, which call the local HTTP API with the saved local session. Do not write ad-hoc SQL or use a database client from the conversation.
- Before the first operation, and whenever the script reports a missing or expired session, ask the user to run `node scripts/session.mjs login` in their local TTY. It hides both account and password input. Never request, receive, repeat, or place either value in chat, command parameters, environment variables, files, logs, or `.env`.
- `node scripts/session.mjs whoami` shows the safe current identity. `logout` first revokes the server session then clears local state; `clear` is local-only emergency cleanup and may leave the server session active until it expires. The session file is outside the workspace at `%LOCALAPPDATA%\Tutor-Workspace\data-operation-session.json`, protected for the current Windows user and `SYSTEM`; it contains no password but must never be copied or printed.
- A clear, single-meaning user request authorizes that specific write. Use `--apply --confirm` as script flags without requesting a duplicate user confirmation.
- Updates and status changes require the current `expectedVersion`; on a version conflict, re-read and ask the user to review instead of overwriting.
- There is intentionally no delete command. Refuse physical deletion, clearing, cross-database work, schema changes, migrations, and seeds in this conversation.
- Guardian contact values must never be printed or copied into chat. API responses are limited to the existing masked projection.
- Do not run development-only account/bootstrap scripts. `actorReady` in the preflight is historical information only; a valid authenticated session and the server's role/data boundary decide access.

## When to pause

- Ask only when a name matches multiple students, the target or intended fields are ambiguous, the actual impact differs from the request, or a version/result conflict needs a decision.
- If a supported script is missing or fails, do not repair it here. Produce a short prompt for the development conversation with the request, observed error, expected behavior, and affected IDs.
- Do not treat a script preview, timeout, or uncertain result as a completed write.

## Commands

Set the local app endpoint when it is not port 3000:

```powershell
$env:STUDENT_DATA_BASE_URL = 'http://127.0.0.1:3001'
node scripts/session.mjs login
node scripts/session.mjs whoami
```

Read:

```powershell
node scripts/student-data.mjs list --keyword 张 --status 在读
node scripts/student-data.mjs get --id 12
node scripts/learning-record-data.mjs list --student-id 12
node scripts/task-data.mjs list --status enabled
node scripts/task-data.mjs assignments --student-id 12 --status pending
node scripts/contract-data.mjs list --student-id 12
node scripts/study-plan-data.mjs list --keyword 目标
```

For a clear request, the assistant may execute the matching command with `--apply --confirm` immediately. Use preview only when clarification is needed:

```powershell
node scripts/student-data.mjs create --name 新同学 --grade 初一 --school 示例学校
node scripts/student-data.mjs create --name 新同学 --grade 初一 --school 示例学校 --apply --confirm
node scripts/student-data.mjs update --id 12 --expected-version 1 --name 新姓名 --grade 初二 --apply --confirm
node scripts/student-data.mjs status --id 12 --status 已结课 --expected-version 2 --apply --confirm
```

Use `learning-record-data.mjs` for records (`list/get/create/update`) and `task-data.mjs` for task/assignment operations (`list/get/assignments/assignment/assign/completion`). Records and completion require their stable record/assignment IDs plus current versions; assignments require the target task, explicit student IDs and due date. `contract-data.mjs` and `study-plan-data.mjs` remain query-only. Consult `scripts/README.md` for exact fields, bounded lookup and stdin contact handling.

If create returns `STUDENT_POSSIBLE_DUPLICATE`, show the masked candidate summary and ask for a separate decision. Only then may the user repeat the command with `--confirm-possible-duplicate --apply --confirm`.

## Reporting

Report the operation, affected IDs, HTTP/API result, and verification status. If a session expires, CSRF becomes invalid, or a write result is unknown, stop: do not retry, re-login automatically, or claim success. Do not report raw request bodies when they contain a guardian phone, Cookie or CSRF value, and do not claim a write succeeded unless the API returned success and the script printed the resulting safe projection.
