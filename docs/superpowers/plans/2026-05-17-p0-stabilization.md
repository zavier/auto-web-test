# P0 骨架稳定化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DSL 引入运行时校验，让 Executor 返回结构化结果和日志，把凭据迁移到环境变量，使 P0 验证骨架达到稳定可扩展状态。

**Architecture:** 用 zod 作为唯一类型来源（TypeScript 类型从 schema 推导），Executor 在 run() 入口做前置校验并收集 TaskLog，Runtime 的 createProject 独立完成 API commit 并返回 output，addMembers 改为对已有项目操作。

**Tech Stack:** TypeScript, Playwright, zod, dotenv

---

## 文件结构映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 新增 `zod`、`dotenv` 依赖 |
| `src/dsl.ts` | 重写 | zod schema 定义、类型推导、环境变量读取、`WorkflowResult`/`TaskLog` 类型、修改 `sampleExpenseWorkflow` |
| `src/executor.ts` | 重写 | 前置 schema 校验、`WorkflowResult` 返回、结构化日志收集、失败即停止 |
| `src/pages/expense-app.ts` | 修改 | `createProject` 独立完成 API commit 并返回 output；`addMembers` 改为对已有项目操作 |
| `tests/expense-workflow.spec.ts` | 修改 | 断言 `WorkflowResult`，验证 `success`、`outputs`、`logs` |
| `.env.example` | 新建 | 凭据环境变量模板 |
| `.env` | 新建（本地） | 真实凭据，不提交到 git |
| `.gitignore` | 修改/新建 | 忽略 `.env` |

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 zod 和 dotenv**

```bash
npm install --save-dev zod dotenv
```

- [ ] **Step 2: 验证 package.json**

Run: `cat package.json`

Expected: `devDependencies` 中包含 `"zod"` 和 `"dotenv"`，版本合理。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add zod and dotenv for DSL validation and env loading"
```

---

## Task 2: 重构 DSL Layer

**Files:**
- Modify: `src/dsl.ts`

- [ ] **Step 1: 重写 src/dsl.ts**

完整替换文件内容：

```ts
import 'dotenv/config';
import { z } from 'zod';

const AuthLoginTask = z.object({
  task: z.literal('auth.login'),
  args: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});

const ProjectCreateTask = z.object({
  task: z.literal('project.create'),
  args: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    members: z.array(z.string().min(1)).optional(),
  }),
});

const ProjectAddMembersTask = z.object({
  task: z.literal('project.addMembers'),
  args: z.object({
    members: z.array(z.string().min(1)),
  }),
});

const ExpenseCreateTask = z.object({
  task: z.literal('expense.create'),
  args: z.object({
    payer: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1),
    amount: z.number().positive(),
    category: z.string().min(1),
    remark: z.string().optional(),
  }),
});

export const WorkflowTaskSchema = z.union([
  AuthLoginTask,
  ProjectCreateTask,
  ProjectAddMembersTask,
  ExpenseCreateTask,
]);

export const WorkflowSchema = z.array(WorkflowTaskSchema);

export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;

export type TaskOutput = Record<string, unknown> | undefined;

export type TaskLog = {
  task: string;
  status: 'started' | 'success' | 'failed';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  output?: TaskOutput;
  error?: string;
};

export type WorkflowResult = {
  success: boolean;
  durationMs: number;
  logs: TaskLog[];
  outputs: {
    projectId?: number;
    projectName?: string;
  };
};

export const sampleExpenseWorkflow = (suffix = Date.now().toString()): Workflow => [
  {
    task: 'auth.login',
    args: {
      username: process.env.EXPENSE_USERNAME ?? '',
      password: process.env.EXPENSE_PASSWORD ?? '',
    },
  },
  {
    task: 'project.create',
    args: {
      name: `测试自动化项目 ${suffix}`,
      description: '这是测试自动化的项目',
      members: ['自动化1号', '自动化2号', '自动化3号'],
    },
  },
  {
    task: 'expense.create',
    args: {
      payer: '自动化1号',
      participants: ['自动化1号', '自动化2号', '自动化3号'],
      amount: 50,
      category: '饮食',
      remark: '111',
    },
  },
];
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/dsl.ts
git commit -m "feat(dsl): add zod schema validation, env-based credentials, and result types"
```

---

## Task 3: 重构 Executor Layer

**Files:**
- Modify: `src/executor.ts`

- [ ] **Step 1: 重写 src/executor.ts**

完整替换文件内容：

```ts
import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask, TaskOutput, WorkflowResult } from './dsl.js';
import { WorkflowSchema } from './dsl.js';
import { ExpenseApp } from './pages/expense-app.js';

export class WorkflowExecutor {
  private readonly app: ExpenseApp;

  constructor(page: Page) {
    this.app = new ExpenseApp(page);
  }

  async run(workflow: Workflow): Promise<WorkflowResult> {
    const parseResult = WorkflowSchema.safeParse(workflow);
    if (!parseResult.success) {
      throw new Error(`DSL validation failed: ${parseResult.error.message}`);
    }

    const result: WorkflowResult = {
      success: true,
      durationMs: 0,
      logs: [],
      outputs: {},
    };

    const workflowStart = Date.now();

    for (const step of parseResult.data) {
      const log: TaskLog = {
        task: step.task,
        status: 'started',
        startTime: Date.now(),
      };

      try {
        const output = await this.runTask(step);
        log.status = 'success';
        log.output = output;

        if (output?.projectId) {
          result.outputs.projectId = output.projectId as number;
        }
        if (output?.projectName) {
          result.outputs.projectName = output.projectName as string;
        }
      } catch (error) {
        log.status = 'failed';
        log.error = error instanceof Error ? error.message : String(error);
        result.success = false;
        break;
      } finally {
        log.endTime = Date.now();
        log.durationMs = log.endTime - log.startTime;
        result.logs.push(log);
      }
    }

    result.durationMs = Date.now() - workflowStart;
    return result;
  }

  private async runTask(step: WorkflowTask): Promise<TaskOutput> {
    switch (step.task) {
      case 'auth.login':
        await this.app.login(step.args);
        return undefined;
      case 'project.create':
        return await this.app.createProject(step.args);
      case 'project.addMembers':
        return await this.app.addMembers(step.args);
      case 'expense.create':
        await this.app.createExpense(step.args);
        return undefined;
      default: {
        const unreachable: never = step;
        throw new Error(`Unsupported task: ${JSON.stringify(unreachable)}`);
      }
    }
  }
}
```

注意：文件顶部需要导入 `TaskLog`，但 `TaskLog` 类型没有从 `./dsl.js` 导入。需要添加导入。实际上 `TaskLog` 是局部变量用的类型注解，可以内联定义或从 dsl 导入。为了类型安全，应该从 dsl 导入。

修正：在 `src/dsl.ts` 中已经定义了 `TaskLog`，在 `src/executor.ts` 中需要导入它。

```ts
import type { Workflow, WorkflowTask, TaskOutput, WorkflowResult, TaskLog } from './dsl.js';
```

所以完整导入应为：
```ts
import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask, TaskOutput, WorkflowResult, TaskLog } from './dsl.js';
import { WorkflowSchema } from './dsl.js';
import { ExpenseApp } from './pages/expense-app.js';
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/executor.ts
git commit -m "feat(executor): add schema validation, structured logs, and WorkflowResult"
```

---

## Task 4: 重构 Runtime Layer

**Files:**
- Modify: `src/pages/expense-app.ts`

- [ ] **Step 1: 修改类型定义和 createProject**

修改 `CreateProjectArgs` 类型：

```ts
type CreateProjectArgs = {
  name: string;
  description?: string;
  members?: string[];
};
```

替换 `createProject` 方法为：

```ts
async createProject(args: CreateProjectArgs): Promise<{ projectId: number; projectName: string }> {
  this.latestProjectName = args.name;
  await this.page.getByRole('button', { name: '创建项目' }).click();
  await this.page.locator('input[name="projectName"]').fill(args.name);
  await this.page.locator('input[name="projectDesc"]').fill(args.description ?? '');

  if (args.members) {
    for (const member of args.members) {
      await this.page.getByRole('button', { name: '新增', exact: true }).click();
      const input = this.page.locator('input[name="flat"]').last();
      await input.click();
      await input.pressSequentially(member, { delay: 20 });
      await this.page.keyboard.press('Tab');
    }
  }

  await this.createProjectByApi(args.members ?? []);
  await this.page.goto('/expense/index-cdn.html#/project/list');

  return { projectId: this.latestProjectId!, projectName: args.name };
}
```

- [ ] **Step 2: 修改 addMembers**

替换 `addMembers` 方法为：

```ts
async addMembers(args: AddMembersArgs): Promise<{ projectId: number }> {
  if (!this.latestProjectId) {
    throw new Error('Cannot add members before project.create has produced a project id.');
  }

  await this.page.goto('/expense/index-cdn.html#/project/list');

  const projectRow = this.page.locator('tr').filter({ hasText: this.latestProjectName! });
  await projectRow.getByRole('button', { name: '编辑' }).click();

  for (const member of args.members) {
    await this.page.getByRole('button', { name: '新增', exact: true }).click();
    const input = this.page.locator('input[name="flat"]').last();
    await input.click();
    await input.pressSequentially(member, { delay: 20 });
    await this.page.keyboard.press('Tab');
  }

  await this.page.getByRole('button', { name: '提交' }).click();
  await this.page.goto('/expense/index-cdn.html#/project/list');

  return { projectId: this.latestProjectId };
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): createProject returns output, addMembers operates on existing project"
```

---

## Task 5: 环境变量配置

**Files:**
- Create: `.env.example`
- Create: `.env`（本地文件，不提交）
- Modify: `.gitignore`

- [ ] **Step 1: 创建 .env.example**

```bash
cat > .env.example << 'EOF'
EXPENSE_USERNAME=admin
EXPENSE_PASSWORD=admin
EOF
```

- [ ] **Step 2: 创建本地 .env**

从模板复制并填入真实凭据（如果有不同）：

```bash
cp .env.example .env
```

如果真实凭据不是 admin/admin，编辑 `.env` 修改。

- [ ] **Step 3: 确保 .env 被 git 忽略**

如果 `.gitignore` 不存在，创建它：

```bash
if [ ! -f .gitignore ]; then
  echo ".env" > .gitignore
else
  if ! grep -q "^\.env$" .gitignore; then
    echo ".env" >> .gitignore
  fi
fi
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add env example and ignore local .env file"
```

---

## Task 6: 回归验证

**Files:**
- Modify: `tests/expense-workflow.spec.ts`

- [ ] **Step 1: 修改测试断言**

替换 `tests/expense-workflow.spec.ts` 为：

```ts
import { test, expect } from '@playwright/test';
import { sampleExpenseWorkflow } from '../src/dsl.js';
import { WorkflowExecutor } from '../src/executor.js';

test('expense workflow can be executed from structured DSL', async ({ page }) => {
  const workflow = sampleExpenseWorkflow();
  const executor = new WorkflowExecutor(page);

  const result = await executor.run(workflow);

  expect(result.success).toBe(true);
  expect(result.outputs.projectId).toBeDefined();
  expect(result.outputs.projectName).toBeDefined();
  expect(result.logs).toHaveLength(3);
  expect(result.logs[0].task).toBe('auth.login');
  expect(result.logs[0].status).toBe('success');
  expect(result.logs[0].durationMs).toBeDefined();
  expect(result.logs[1].task).toBe('project.create');
  expect(result.logs[1].status).toBe('success');
  expect(result.logs[1].output).toBeDefined();
  expect(result.logs[2].task).toBe('expense.create');
  expect(result.logs[2].status).toBe('success');
});
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`

Expected: 无错误。

- [ ] **Step 3: 运行回归测试**

Run: `npx playwright test tests/expense-workflow.spec.ts --project=chromium`

Expected: `1 passed`。

- [ ] **Step 4: Commit**

```bash
git add tests/expense-workflow.spec.ts
git commit -m "test: assert WorkflowResult outputs and structured logs"
```

---

## Self-Review

**1. Spec coverage:**

| Spec 要求 | 对应任务 |
|-----------|---------|
| DSL zod schema 校验 | Task 2 (`src/dsl.ts`) |
| 类型从 schema 推导 | Task 2 (`z.infer<typeof ...>`) |
| `project.create` 扩展可选 `members` | Task 2 (schema)、Task 4 (runtime) |
| 凭据从 `process.env` 读取 | Task 2 (`sampleExpenseWorkflow`)、Task 5 (`.env.example`) |
| Executor 前置校验 | Task 3 (`WorkflowSchema.safeParse`) |
| Executor 返回 `WorkflowResult` | Task 3 |
| 结构化 `TaskLog` 收集 | Task 3 |
| 失败即停止 | Task 3 (`break` on catch) |
| `createProject` 返回 output | Task 4 |
| `addMembers` 对已有项目操作 | Task 4 |
| 回归验证 | Task 6 |

无遗漏。

**2. Placeholder scan:**

- 无 "TBD"、"TODO"、"implement later"。
- 所有步骤包含完整代码和命令。
- `addMembers` 给出了完整的 Playwright 实现代码，不是占位符。

**3. Type consistency:**

- `TaskOutput`、`WorkflowResult`、`TaskLog` 在 Task 2 定义，Task 3 导入使用，名称一致。
- `createProject` 返回类型 `{ projectId: number; projectName: string }` 在 Task 4 定义，Task 3 的 `runTask` switch case 中匹配。
- `addMembers` 返回类型 `{ projectId: number }` 在 Task 4 定义，Task 3 匹配。

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-p0-stabilization.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
