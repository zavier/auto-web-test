# CLAUDE.md

AI planning + deterministic execution framework for web automation.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Type check | `npx tsc --noEmit` |
| Run all tests | `npm run test:unit && npx playwright test` |
| Run expense workflow test | `npx playwright test tests/expense/workflow.spec.ts --project=chromium` |
| Run a single test (headed) | `npx playwright test <path> --project=chromium --headed` |
| Run with UI | `npm run test:headed` |
| Run unit tests | `npx vitest run` |

Playwright is configured to use system Chrome (`channel: 'chrome'` in `playwright.config.ts`).

Vitest config at `vitest.config.ts` excludes `*.spec.ts` to avoid Playwright runner conflict.

## Conventions

- **No barrel files.** Imports go directly to the file that defines the symbol (all `index.ts` pass-throughs were removed).
- **Mock OpenAI in unit tests** with `vi.mock('openai', ...)` — real network calls hang on invalid API keys.

## Architecture

This project validates an "AI planning + deterministic execution" web automation workflow. The stack has four layers:

### 1. Core Layer (`src/core/`)

Cross-project generic capabilities:

- **`src/core/dsl/types.ts`** — Generic types: `TaskLog`, `WorkflowResult`, `TaskOutput`
- **`src/core/planner/types.ts`** — `Capability`, `ProjectAdapter`, `ArgMeta` types
- **`src/core/planner/registry.ts`** — Extracts `Capability[]` from zod schemas via introspection
- **`src/core/planner/planner.ts`** — Generic LLM Planner (OpenAI + prompt + correction loop)
- **`src/core/template/`** — TemplateEngine for parameterizing workflow steps
- **`src/core/recorder/`** — WorkflowParameterizer with configurable mapping rules

### 2. Project Adapter Layer (`src/projects/`)

Each business system implements its own adapter:

- **`tasks.ts`** — Zod schema definitions with `.describe()` annotations
- **`capabilities.ts`** — Registers capabilities for this project
- **`adapter.ts`** — `ProjectAdapter` implementation (orchestrates UI + API)
- **`api-client.ts`** — Stateless API client
- **`pages/<project>-page.ts`** — Stateless page object (pure DOM)
- **`cli.ts`** — Project-specific natural-language-to-DSL CLI
- **`recorder-rules.ts`** — Workflow recording parameterization rules

Current adapters:
- `src/projects/expense/` — Expense management system (first adapter)

### 3. Executor Layer (`src/executor.ts`)

- `src/executor.ts` — Generic `WorkflowExecutor` that dispatches to a `ProjectAdapter`

### 4. Project-specific CLI

- `src/projects/expense/cli.ts` — Expense project CLI for natural-language-to-DSL planning

## Test Structure

- **E2E tests** (`tests/**/*.spec.ts`) — Playwright browser tests
- **Unit tests** (`tests/**/*.test.ts`) — Vitest, no browser needed

```
tests/
  planner/
    registry.test.ts     — Capability extraction from zod schemas
    planner.test.ts      — LLM Planner (mocked OpenAI)
  template/
    engine.test.ts       — Template variable resolution
    context.test.ts      — VariableContext builder
  recorder/
    parameterizer.test.ts — Workflow recording parameterization
  expense/
    workflow.spec.ts     — E2E expense workflow
```

## Current Design Decisions

- **LLM does not control the browser directly.** It generates structured DSL. Execution is handled by the Executor and Runtime.
- **WorkflowExecutor is generic** — it dispatches tasks to a `ProjectAdapter` without knowing project-specific logic.
- **ProjectAdapter describes AND executes** — each adapter provides capabilities (for the Planner) and task execution (for the Executor).
- **Page objects and API clients are stateless** — all cross-task state flows through `context.outputs` passed between steps.
- **API/UI hybrid execution is intentional for v0.** Some actions use UI for input and API for commit because of AMIS component sync issues.
- **Task output is more reliable than page visibility.** Project lists are paginated, so `project.create` queries the API to get `projectId`.
- **Capability Registry extracts metadata from zod schemas.** Uses Zod v4 public API (`.shape`, `.options`, `.value`, `.type`, `.unwrap()`).
- **Template variables require explicit scope prefix.** `${env.VAR}`, `${global.VAR}`, `${input.VAR}`, `${output.VAR}` — bare names are rejected.
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

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
