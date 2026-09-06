---
name: workspace-harness
description: Use when an AI harness starts work in the Tutor-Workspace repository, especially when routing between product, development, testing, and student-data operations.
---

# Workspace harness

Use this skill as the tool-independent entry routine for Codex, Claude Code, DSH, and similar agents.

## Start here

1. Read the repository `AGENTS.md`.
2. Read `docs/design/workspace-harness-guide.md`.
3. For code, API, database, Redis, or auth work, read `docs/design/full-stack-development-rules.md` completely.
4. Read the confirmed PRD, design, and test documents for the requested module.
5. Inspect `git status` and the existing files before editing.

## Route the request

- Planning or business-rule changes belong in `docs/prd/` or `docs/design/` and stop before implementation until confirmed.
- Prototype work uses the existing mock/service boundary and must not silently create real persistence.
- Real implementation follows a vertical slice: migration, API, UI integration, self-test, then independent test.
- Student data maintenance uses `skills/student-data-operations/SKILL.md` and the versioned scripts; do not improvise SQL.

## Hard stops

- Never reveal `.env`, credentials, full contact values, or driver stack traces.
- Never operate outside the approved `tutor_workspace` database.
- Never physically delete student data or run a clear/reset command.
- Do not infer permissions from `DEV_ACTOR_ID`; the current app is not safe for real or public use.
- Do not commit, push, install dependencies, or expand scope unless the user explicitly authorizes it.
