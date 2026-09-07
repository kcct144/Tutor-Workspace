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

- Default to two conversations: development and student-data operations.
- Development handles planning when rules are unclear, then implements code, scripts, skills, and relevant self-tests in one flow.
- Independent testing is optional and happens only when the user asks for it or the change warrants it.
- Real implementation follows a vertical slice: migration, API, UI integration, and self-test.
- Student data maintenance uses `skills/student-data-operations/SKILL.md` and the versioned scripts; do not improvise SQL.

## Hard stops

- Never reveal `.env`, credentials, full contact values, or driver stack traces.
- Never operate outside the approved `tutor_workspace` database.
- Never physically delete student data or run a clear/reset command.
- Do not infer permissions from `DEV_ACTOR_ID`; the current app is for a user-controlled local session and must not be exposed publicly.
- Do not commit, push, install dependencies, or expand scope unless the user explicitly authorizes it.
