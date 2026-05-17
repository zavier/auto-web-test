# P0 骨架稳定化设计文档

## 背景与目标

当前验证骨架已跑通最小闭环（登录 → 创建项目 → 添加成员 → 创建费用），但存在以下问题：

1. DSL 没有运行时校验，LLM 输出的非法结构只能在执行时暴露。
2. `WorkflowExecutor` 不返回任何信息，执行过程黑盒。
3. Task 间数据（`projectId`、`authToken`）完全依赖 Runtime 内部隐式状态。
4. 账号密码硬编码在 `sampleExpenseWorkflow` 中。

本设计一次性解决上述问题，让 P0 骨架达到可稳定运行、可审查、可扩展的状态。

## 设计原则

- **类型从 schema 推导**：用 zod 作为唯一类型来源，TypeScript 类型通过 `z.infer<>` 获得，不维护两份定义。
- **混合状态模型**：基础上下文（`authToken`、`projectId`）仍由 Runtime 隐式维护，但关键 output 在执行日志中显式暴露。
- **失败即停止**：单个 task 失败时中断 workflow，保留已执行任务的日志供诊断。
- **最小侵入**：测试入口 `tests/expense-workflow.spec.ts` 和 `playwright.config.ts` 不做结构性改动。

## 架构变化概览

| 文件 | 操作 | 核心变更 |
|------|------|---------|
| `src/dsl.ts` | 编辑 | 引入 zod schema；`project.create` 扩展可选 `members`；移除硬编码凭据 |
| `src/executor.ts` | 编辑 | `run()` 返回 `WorkflowResult`；前置 schema 校验；结构化日志收集 |
| `src/pages/expense-app.ts` | 编辑 | `createProject` 独立完成 API commit 并返回 output；`addMembers` 支持已有项目 |
| `.env.example` | 新建 | 凭据环境变量模板 |
| `package.json` | 编辑 | 新增 `zod`、`dotenv` 依赖 |

## DSL Layer 设计 (`src/dsl.ts`)

### zod Schema 定义

每个 task 定义独立 schema，外层用 `z.union` 组合：

```ts
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
```

### 凭据迁移

`sampleExpenseWorkflow` 从 `process.env` 读取凭据：

```ts
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

### 新增结果类型

```ts
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
```

## Executor Layer 设计 (`src/executor.ts`)

### 执行流程

```ts
async run(workflow: Workflow): Promise<WorkflowResult> {
  // 1. 前置 schema 校验
  const parseResult = WorkflowSchema.safeParse(workflow);
  if (!parseResult.success) {
    throw new Error(`DSL validation failed: ${parseResult.error.message}`);
  }

  // 2. 顺序执行，收集日志
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

      // 将关键 output 提升到 result.outputs
      if (output?.projectId) result.outputs.projectId = output.projectId as number;
      if (output?.projectName) result.outputs.projectName = output.projectName as string;
    } catch (error) {
      log.status = 'failed';
      log.error = error instanceof Error ? error.message : String(error);
      result.success = false;
      break; // 失败即停止
    } finally {
      log.endTime = Date.now();
      log.durationMs = log.endTime - log.startTime;
      result.logs.push(log);
    }
  }

  result.durationMs = Date.now() - workflowStart;
  return result;
}
```

### `runTask` 返回类型

```ts
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
```

## Runtime Layer 设计 (`src/pages/expense-app.ts`)

### `createProject(args)` — 独立闭环

语义：创建项目（含可选成员），返回项目信息。

执行步骤：
1. 记录 `this.latestProjectName = args.name`
2. UI 点击"创建项目"
3. UI 填写 `projectName`、`projectDesc`
4. 如果 `args.members` 存在，UI 逐个填写 input-array
5. 调用 `createProjectByApi(args.members ?? [])`
6. 设置 `this.latestProjectId`
7. 返回 `{ projectId: this.latestProjectId, projectName: args.name }`

### `addMembers(args)` — 对已有项目添加成员

前置条件：`this.latestProjectId` 必须已存在（即前面执行过 `project.create`）。

执行步骤：
1. 检查 `latestProjectId`，不存在则抛错
2. UI 打开项目编辑/成员管理界面（或调用 API）
3. 添加成员
4. 返回 `{ projectId: this.latestProjectId }`

**注意**：当前阶段因 AMIS input-array 同步问题，`addMembers` 的实现可能仍需要 API 兜底。P1 会专项修复为纯 UI Action。

### `createExpense(args)` — 保持不变

调用 API commit + 页面断言，未来可扩展返回 `{ recordId }`。

### `login(args)` — 保持不变

不返回 output，`authToken` 仍隐式维护。

## 环境变量配置

### `.env.example`

```
EXPENSE_USERNAME=admin
EXPENSE_PASSWORD=admin
```

### 加载方式

在 `src/dsl.ts` 顶部引入 `dotenv/config`：

```ts
import 'dotenv/config';
```

Playwright 测试进程会自然加载项目根目录的 `.env` 文件。

## 测试策略

- 回归测试：`npx playwright test tests/expense-workflow.spec.ts --project=chromium` 必须继续通过。
- 本地运行时需在项目根目录创建 `.env` 文件并填入真实凭据。
- CI 阶段（如有）通过环境变量注入，不提交 `.env`。

## 后续扩展点

| 扩展 | 时机 | 说明 |
|------|------|------|
| `expense.create` 返回 `recordId` | P1 | 需要 API 返回该字段或页面解析 |
| `project.addMembers` 纯 UI 化 | P1 | 修复 AMIS input-array 后实现 |
| 任务级 retry policy | P2 | 在 Executor 的 catch 块中增加重试逻辑 |
| LLM Planner DSL 修正回路 | P2 | 校验失败时把 zod 错误信息返回给 LLM |
