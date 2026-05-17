# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|------|---------|
| Type check | `npx tsc --noEmit` |
| Run all tests | `npx playwright test` |
| Run expense workflow test | `npx playwright test tests/expense-workflow.spec.ts --project=chromium` |
| Run a single test (headed) | `npx playwright test <path> --project=chromium --headed` |
| Run with UI | `npm run test:headed` |

Playwright is configured to use system Chrome (`channel: 'chrome'` in `playwright.config.ts`).

## Architecture

This project validates an "AI planning + deterministic execution" web automation workflow. The stack has four layers:

1. **DSL (`src/dsl.ts`)** — Business-oriented task definitions (`auth.login`, `project.create`, `expense.create`). LLMs should generate this, not Playwright code.
2. **Executor (`src/executor.ts`)** — Sequentially routes DSL tasks to the runtime. Uses `never` exhaustiveness checking for unknown tasks.
3. **Runtime (`src/pages/expense-app.ts`)** — Encapsulates business actions, auth token management, and the UI/API hybrid execution strategy.
4. **Playwright (`playwright.config.ts`, `tests/`)** — Drives the browser. Tests construct a DSL workflow and pass it to the executor.

## Current Design Decisions

- **LLM does not control the browser directly.** It generates structured DSL. Execution is handled by the Executor and Runtime. This keeps failures reproducible and avoids infinite agent loops.
- **API/UI hybrid execution is intentional for v0.** Some actions use the UI for input and API for commit because of AMIS component sync issues (see Known Quirks). The goal is to prove the DSL → Executor → result loop first, then replace API commits with stable UI actions.
- **Task output is more reliable than page visibility.** Project lists are paginated, so `project.create` queries the API to get `projectId` instead of asserting the name is visible on the current page.

## Known Quirks of the Target Application

These are real behaviors of the expense system under test, not bugs in the test code:

- **Login returns JWT, but the frontend does not persist it.** The Runtime captures the login response and injects it via `page.setExtraHTTPHeaders({ Authorization: <jwt> })`.
- **Authorization header is raw JWT, not `Bearer <jwt>`.**
- **AMIS `input-array` for project members has a sync bug.** DOM values display correctly, but the submit payload can contain empty strings. Therefore `addMembers` fills the UI inputs for validation, then calls `createProjectByApi` to commit.
- **Expense creation currently uses API commit + page assertion.** The UI select actions for payer, participants, and category are not yet stable enough for automation.
- **Expense `date` field requires a seconds-level Unix timestamp.** `Math.floor(Date.now() / 1000)` is correct. Milliseconds or ISO strings cause errors.
- **Test data is not cleaned up.** Created projects and expenses remain in the test environment.

## Next Priorities

The `docs/todo.md` backlog is ordered by priority. The current focus (P0) is:

- Add runtime DSL validation (e.g. zod).
- Add structured execution logging to `WorkflowExecutor`.
- Model task outputs explicitly (e.g. `project.create` returns `projectId`).
- Move credentials from hardcoded DSL sample to environment variables.
