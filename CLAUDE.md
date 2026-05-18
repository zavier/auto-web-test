# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|------|---------|
| Type check | `npx tsc --noEmit` |
| Run all tests | `npx playwright test` |
| Run expense workflow test | `npx playwright test tests/expense/workflow.spec.ts --project=chromium` |
| Run a single test (headed) | `npx playwright test <path> --project=chromium --headed` |
| Run with UI | `npm run test:headed` |
| Run planner registry test | `npx tsx tests/planner/registry.test.ts` |
| Run planner test | `npx tsx tests/planner/planner.test.ts` |

Playwright is configured to use system Chrome (`channel: 'chrome'` in `playwright.config.ts`).

## Architecture

This project validates an "AI planning + deterministic execution" web automation workflow. The stack has four layers:

### 1. Core Layer (`src/core/`)

Cross-project generic capabilities:

- **`src/core/dsl/types.ts`** — Generic types: `TaskLog`, `WorkflowResult`, `TaskOutput`
- **`src/core/planner/types.ts`** — `Capability`, `ProjectAdapter`, `ArgMeta` types
- **`src/core/planner/registry.ts`** — Extracts `Capability[]` from zod schemas via introspection
- **`src/core/planner/planner.ts`** — Generic LLM Planner (OpenAI + prompt + correction loop)
- **`src/core/capability-registry.ts`** — Aggregates all project adapters

### 2. Project Adapter Layer (`src/projects/`)

Each business system implements its own adapter (minimum 3 files):

- **`tasks.ts`** — Zod schema definitions with `.describe()` annotations
- **`capabilities.ts`** — Registers capabilities for this project
- **`pages/<project>-app.ts`** — Runtime implementation

Current adapters:
- `src/projects/expense/` — Expense management system (first adapter)

### 3. Compatibility Layer (`src/dsl.ts`, `src/executor.ts`)

Thin wrappers that re-export from core + keep expense-specific schemas:
- `src/dsl.ts` — Re-exports generic types + defines expense task schemas
- `src/executor.ts` — Expense-specific WorkflowExecutor

### 4. Legacy (`src/planner/`, `src/pages/`)

Old files pending cleanup:
- `src/planner/registry.ts` — Migrated to `src/core/planner/registry.ts`
- `src/planner/planner.ts` — Migrated to `src/core/planner/planner.ts`
- `src/pages/expense-app.ts` — Should migrate to `src/projects/expense/pages/`

## Test Structure

```
tests/
  planner/
    registry.test.ts    — Tests Capability extraction from zod schemas
    planner.test.ts     — Tests LLM Planner (empty input, invalid key)
  expense/
    workflow.spec.ts    — E2E expense workflow test
```

## Current Design Decisions

- **LLM does not control the browser directly.** It generates structured DSL. Execution is handled by the Executor and Runtime.
- **API/UI hybrid execution is intentional for v0.** Some actions use UI for input and API for commit because of AMIS component sync issues.
- **Task output is more reliable than page visibility.** Project lists are paginated, so `project.create` queries the API to get `projectId`.
- **Capability Registry extracts metadata from zod schemas.** No separate registration file needed — `.describe()` on schema fields is the source of truth.
- **Multi-project architecture is in early v3.** Core layer extracted, first adapter (expense) created, but new project onboarding not yet validated.

## Known Quirks of the Target Application

- **Login returns JWT, but the frontend does not persist it.** The Runtime captures the login response and injects it via `page.setExtraHTTPHeaders({ Authorization: <jwt> })`.
- **Authorization header is raw JWT, not `Bearer <jwt>`.**
- **AMIS `input-array` for project members has a sync bug.** DOM values display correctly, but the submit payload can contain empty strings.
- **Expense creation currently uses API commit + page assertion.** The UI select actions are not yet stable enough for automation.
- **Expense `date` field requires a seconds-level Unix timestamp.** `Math.floor(Date.now() / 1000)` is correct.
- **Test data is not cleaned up.** Created projects and expenses remain in the test environment.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPENSE_USERNAME` | Yes | Login username for expense system |
| `EXPENSE_PASSWORD` | Yes | Login password for expense system |
| `OPENAI_API_KEY` | For Planner | OpenAI API key for LLM Planner |
| `OPENAI_MODEL` | No | Model override (default: `gpt-4o`) |

## Next Priorities

See `docs/todo.md` for the full backlog. Current focus:

1. **P1 UI Action Layer** — Stabilize AMIS Select actions, fix input-array sync
2. **P1 Locator Layer** — Establish locator registry, remove fragile `.first()`/`.last()`
3. **P2 Runtime Enhancement** — Login recovery, API format compatibility, retry policies
4. **P4 Cleanup** — Remove old `src/planner/` and `src/pages/` files, validate new project onboarding
