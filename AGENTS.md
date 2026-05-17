# Repository Guidelines

## Project Structure & Module Organization

This repository validates an AI-assisted web automation workflow for an expense management app. Core TypeScript code lives in `src/`: `src/dsl.ts` defines workflow task types and sample DSL data, `src/executor.ts` maps DSL tasks to deterministic actions, and `src/pages/expense-app.ts` contains Playwright page/runtime logic. Tests live in `tests/`, currently `tests/expense-workflow.spec.ts`. Project notes and design rationale are in `docs/design.md`, `docs/progress.md`, and `docs/todo.md`.

## Build, Test, and Development Commands

- `npm install`: install TypeScript and Playwright dependencies.
- `npx tsc --noEmit`: run TypeScript type checking without writing output.
- `npm test`: run all Playwright tests using `playwright.config.ts`.
- `npm run test:headed`: run Playwright in headed mode for debugging.
- `npm run test:expense`: run the expense workflow spec in headed mode.
- `npx playwright test tests/expense-workflow.spec.ts --project=chromium`: run the main workflow in the configured Chrome project.

The Playwright config uses `https://zhengw-tech.com/expense/index-cdn.html` as `baseURL`, retains traces/videos on failure, and targets system Chrome via `channel: 'chrome'`.

## Coding Style & Naming Conventions

Use TypeScript ES modules with explicit `.js` extensions in relative imports, matching the existing source. Prefer two-space indentation, single quotes, semicolons, and concise exported types/classes. Keep DSL task names namespaced and action-oriented, such as `auth.login` or `expense.create`. Use `PascalCase` for classes like `WorkflowExecutor`, `camelCase` for functions and variables, and kebab-case for test filenames.

## Testing Guidelines

Tests use `@playwright/test`. Place workflow or browser-facing tests under `tests/` and name files `*.spec.ts`. Keep tests focused on user-observable workflow outcomes, while isolating low-level page operations in `src/pages/expense-app.ts`. Before handing off changes, run `npx tsc --noEmit` and the relevant Playwright command. If browser launch is blocked in a sandbox, note that `npx playwright test` may need permission to run outside it.

## Commit & Pull Request Guidelines

The current history uses short, descriptive commits with an optional scope prefix, for example `initial: AI 加持的 Web 自动化测试工作流验证骨架`. Follow that style: summarize the user-visible change and keep the subject concise. Pull requests should include the purpose, key implementation notes, test commands run, and screenshots or trace references when UI behavior changes. Link related docs or issues when available.

## Agent-Specific Instructions

Preserve the current validation-focused shape of the project. Do not replace API fallback paths with UI actions unless the UI interaction is stable and covered by tests. Update `docs/progress.md` or `docs/todo.md` when a change affects known limitations or next steps.
