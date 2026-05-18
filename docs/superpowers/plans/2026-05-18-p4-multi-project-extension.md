# P4 多项目扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取通用 Core 层，将费用系统迁移为第一个 Project Adapter，建立新项目接入模板。

**Architecture:** 分两步：Step 1 创建 `src/core/` 目录并迁移通用代码（DSL 类型、Planner、Capability Registry）；Step 2 创建 `src/projects/expense/` adapter 并将业务代码迁入。保留 `src/dsl.ts` 和 `src/executor.ts` 为兼容层。

**Tech Stack:** TypeScript ESM, zod v4, Playwright

---

### Task 1: 创建 core/dsl/types.ts

**Files:**
- Create: `src/core/dsl/types.ts`
- Create: `src/core/dsl/index.ts`

- [ ] **Step 1: 创建 types.ts**

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
  outputs: Record<string, unknown>;
};
```

- [ ] **Step 2: 创建 index.ts**

```ts
export type { TaskOutput, TaskLog, WorkflowResult } from './types.js';
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误（新增文件未被引用，不应影响现有编译）

- [ ] **Step 4: Commit**

```bash
git add src/core/dsl/
git commit -m "feat(core): add generic DSL types (TaskLog, WorkflowResult)"
```

---

### Task 2: 创建 core/planner/types.ts

**Files:**
- Create: `src/core/planner/types.ts`
- Create: `src/core/planner/index.ts`

- [ ] **Step 1: 创建 types.ts**

```ts
export type ArgMeta = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Capability = {
  project: string;
  task: string;
  description: string;
  args: ArgMeta[];
  riskLevel: 'read' | 'write' | 'destructive';
};

export type ProjectAdapter = {
  project: string;
  getCapabilities(): Capability[];
};
```

- [ ] **Step 2: 创建 index.ts**

```ts
export type { ArgMeta, Capability, ProjectAdapter } from './types.js';
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/core/planner/types.ts src/core/planner/index.ts
git commit -m "feat(core): add Capability and ProjectAdapter types"
```

---

### Task 3: 通用化 registry.ts 并迁移到 core/planner/

**Files:**
- Create: `src/core/planner/registry.ts`
- Delete: `src/planner/registry.ts`（后续 Task 5 统一删除旧目录）

- [ ] **Step 1: 创建 core/planner/registry.ts**

将当前 `src/planner/registry.ts` 的 `getCapabilities` 改为接收 schema 参数，从通用依赖中移除硬编码的 `WorkflowTaskSchema`：

```ts
import type { ZodType } from 'zod';
import type { ArgMeta, Capability } from './types.js';

type ZodSchemaLike = {
  def: {
    type: string;
    [key: string]: unknown;
  };
  type: string;
  description?: string;
};

function getBaseType(schema: ZodSchemaLike): string {
  const type = schema.def.type;
  if (type === 'optional') {
    const inner = schema.def.innerType as ZodSchemaLike;
    return getBaseType(inner);
  }
  if (type === 'array') {
    return 'array';
  }
  return type;
}

function isOptional(schema: ZodSchemaLike): boolean {
  return schema.def.type === 'optional';
}

export function getCapabilities(workflowTaskSchema: ZodType, projectName: string): Capability[] {
  const unionSchema = workflowTaskSchema as unknown as {
    def: {
      type: string;
      options: ZodSchemaLike[];
    };
  };

  const capabilities: Capability[] = [];

  for (const option of unionSchema.def.options) {
    const shape = (option.def as unknown as { shape: Record<string, ZodSchemaLike> }).shape;

    const taskSchema = shape.task;
    const literalValues = (taskSchema.def as unknown as { values: string[] }).values;
    const taskName = literalValues[0];
    const taskDescription = taskSchema.description ?? '';

    const argsSchema = shape.args;
    const argsShape = (argsSchema.def as unknown as { shape: Record<string, ZodSchemaLike> }).shape;

    const args: ArgMeta[] = [];
    for (const [argName, argSchema] of Object.entries(argsShape)) {
      args.push({
        name: argName,
        type: getBaseType(argSchema),
        required: !isOptional(argSchema),
        description: argSchema.description ?? '',
      });
    }

    capabilities.push({
      task: taskName,
      description: taskDescription,
      args,
      project: projectName,
      riskLevel: 'write',
    });
  }

  return capabilities;
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/core/planner/registry.ts
git commit -m "feat(core): add generic Capability Registry with project parameter"
```

---

### Task 4: 创建 core/capability-registry.ts

**Files:**
- Create: `src/core/capability-registry.ts`

- [ ] **Step 1: 创建 capability-registry.ts**

```ts
import type { Capability, ProjectAdapter } from './planner/types.js';

export class CapabilityRegistry {
  private adapters = new Map<string, ProjectAdapter>();

  register(adapter: ProjectAdapter): void {
    this.adapters.set(adapter.project, adapter);
  }

  getAllCapabilities(): Capability[] {
    return Array.from(this.adapters.values()).flatMap((a) => a.getCapabilities());
  }

  getAdapter(project: string): ProjectAdapter | undefined {
    return this.adapters.get(project);
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/core/capability-registry.ts
git commit -m "feat(core): add CapabilityRegistry for multi-project aggregation"
```

---

### Task 5: 迁移 planner.ts 到 core/planner/ 并通用化

**Files:**
- Create: `src/core/planner/planner.ts`

- [ ] **Step 1: 创建 core/planner/planner.ts**

将当前 `src/planner/planner.ts` 复制过来，修改 import 路径：

```ts
import OpenAI from 'openai';
import type { ZodType } from 'zod';
import type { Capability } from './types.js';

export class PlannerError extends Error {
  history: { role: string; content: string }[];
  constructor(message: string, history: { role: string; content: string }[]) {
    super(message);
    this.name = 'PlannerError';
    this.history = history;
  }
}

export type PlannerConfig = {
  openaiApiKey: string;
  model?: string;
};

export type Planner = {
  plan(naturalLanguage: string): Promise<unknown[]>;
};

function buildSystemMessage(capabilities: Capability[]): string {
  const taskList = capabilities.map((cap) => {
    const argList = cap.args
      .map((a) => {
        const required = a.required ? '(必填)' : '(可选)';
        return `    - ${a.name}: ${a.type} ${required} — ${a.description}`;
      })
      .join('\n');
    const risk = cap.riskLevel === 'destructive' ? ' [高风险]' : '';
    return `### ${cap.task}${risk}\n${cap.description}\n参数：\n${argList}`;
  }).join('\n\n');

  return `你是 DSL Planner。你的唯一职责是把用户意图转换为 DSL JSON 数组。

## 可用任务

${taskList}

## 规则

1. 只输出 DSL JSON 数组，不要输出额外文字、解释或 markdown
2. 只能使用上面列出的 task，不能编造不存在的 task
3. 理解用户意图后，按合理顺序排列 task（如先登录、再创建项目、再创建费用）
4. 如果用户没有指定某些必填字段，使用合理的默认值
5. 不要输出 Playwright 代码或任何操作浏览器的指令
6. 输出必须是合法的 JSON 数组
7. 对于标记为 [高风险] 的 task，仅在用户明确要求时才使用`;
}

function buildCorrectionPrompt(originalInput: string, parseError: string): string {
  return `用户原始需求：${originalInput}

上一次输出被校验拒绝，错误信息：

${parseError}

请修正你的 DSL JSON 输出，确保：
- task 名是可用任务列表中的其一
- 所有必填字段都已提供
- 字段类型正确（amount 是 number 不是 string，participants 是 array 等）
- 输出是合法的 JSON 数组`;
}

const MAX_RETRIES = 3;

export function createPlanner(
  config: PlannerConfig,
  capabilities: Capability[],
  workflowSchema: ZodType
): Planner {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const model = config.model ?? 'gpt-4o';

  async function callLLM(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): Promise<string> {
    const response = await client.chat.completions.create(
      {
        model,
        messages,
        response_format: { type: 'json_object' },
      },
      { timeout: 30_000 }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new PlannerError('LLM returned empty response', []);
    return content;
  }

  async function plan(naturalLanguage: string): Promise<unknown[]> {
    if (!naturalLanguage.trim()) return [];

    const systemMessage = buildSystemMessage(capabilities);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
    ];

    let currentInput = naturalLanguage;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      messages.push({ role: 'user', content: currentInput });

      const rawOutput = await callLLM(messages);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawOutput);
      } catch {
        currentInput = buildCorrectionPrompt(
          naturalLanguage,
          `输出不是合法的 JSON。原始输出：${rawOutput.slice(0, 500)}`
        );
        continue;
      }

      const candidate = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown>)?.workflow;

      const result = workflowSchema.safeParse(candidate ?? parsed);
      if (result.success) return result.data as unknown[];

      currentInput = buildCorrectionPrompt(naturalLanguage, result.error.message);
    }

    throw new PlannerError(
      `DSL generation failed after ${MAX_RETRIES} attempts`,
      messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
    );
  }

  return { plan };
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/core/planner/planner.ts
git commit -m "feat(core): migrate generic Planner to core with parameterized schema"
```

---

### Task 6: 迁移 cli.ts 到 core/planner/ 并更新为通用版本

**Files:**
- Create: `src/core/planner/cli.ts`
- Modify: `src/planner/cli.ts`（删除或改为兼容层）

- [ ] **Step 1: 创建 core/planner/cli.ts**

由于 CLI 需要具体的 schema 和 capabilities，core 层的 CLI 保持简单，通过环境变量或参数传入项目名：

```ts
import { createPlanner } from './planner.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let model: string | undefined;
  let input: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (!input) {
      input = args[i];
    }
  }

  if (!input) {
    process.stderr.write(
      'Usage: npx tsx src/core/planner/cli.ts [--model <model>] "<natural language>"\n'
    );
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('Error: OPENAI_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  process.stderr.write('Note: This is the generic planner CLI. Use project-specific CLI for actual planning.\n');
  process.exit(0);
}

main();
```

- [ ] **Step 2: 修改 src/planner/cli.ts 为费用系统特定版本**

```ts
import { createPlanner } from '../core/planner/planner.js';
import { getCapabilities } from '../core/planner/registry.js';
import { WorkflowSchema, WorkflowTaskSchema } from '../dsl.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let model: string | undefined;
  let input: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (!input) {
      input = args[i];
    }
  }

  if (!input) {
    process.stderr.write(
      'Usage: npx tsx src/planner/cli.ts [--model <model>] "<natural language>"\n'
    );
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('Error: OPENAI_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  const capabilities = getCapabilities(WorkflowTaskSchema, 'expense');
  const planner = createPlanner({ openaiApiKey: apiKey, model }, capabilities, WorkflowSchema);

  try {
    const workflow = await planner.plan(input);
    process.stdout.write(JSON.stringify(workflow, null, 2) + '\n');
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/core/planner/cli.ts src/planner/cli.ts
git commit -m "feat(core): add generic CLI stub; update project-specific CLI to use core planner"
```

---

### Task 7: 修改 src/dsl.ts 为兼容层 + 费用系统 schema

**Files:**
- Modify: `src/dsl.ts`

- [ ] **Step 1: 修改 dsl.ts 为 re-export + 费用系统 schema**

保留费用系统的具体 schema 定义，但从 core 导入通用类型：

```ts
import { z } from 'zod';

export type { TaskOutput, TaskLog, WorkflowResult } from './core/dsl/types.js';

const AuthLoginTask = z.object({
  task: z.literal('auth.login').describe('登录费用管理系统'),
  args: z.object({
    username: z.string().min(1).describe('登录用户名'),
    password: z.string().min(1).describe('登录密码'),
  }),
});

const ProjectCreateTask = z.object({
  task: z.literal('project.create').describe('创建费用分摊项目'),
  args: z.object({
    name: z.string().min(1).describe('项目名称'),
    description: z.string().optional().describe('项目描述'),
    members: z.array(z.string().min(1)).optional().describe('项目成员姓名列表'),
  }),
});

const ProjectAddMembersTask = z.object({
  task: z.literal('project.addMembers').describe('向项目添加成员'),
  args: z.object({
    members: z.array(z.string().min(1)).describe('要添加的成员姓名列表'),
  }),
});

const ExpenseCreateTask = z.object({
  task: z.literal('expense.create').describe('在项目中创建一笔费用记录，包含支付人、参与人、金额、类别'),
  args: z.object({
    payer: z.string().min(1).describe('支付人姓名'),
    participants: z.array(z.string().min(1)).min(1).describe('参与分摊的人员姓名列表'),
    amount: z.number().positive().describe('费用金额（元）'),
    category: z.string().min(1).describe('费用类别，如：饮食、交通、住宿、办公'),
    remark: z.string().optional().describe('备注说明'),
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

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/dsl.ts
git commit -m "refactor(dsl): import generic types from core, keep expense-specific schema"
```

---

### Task 8: 修改 src/executor.ts 为兼容层

**Files:**
- Modify: `src/executor.ts`

- [ ] **Step 1: 修改 executor.ts**

保持费用系统特定的 executor，但从 core 导入通用类型：

```ts
import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask, TaskOutput } from './dsl.js';
import { WorkflowSchema } from './dsl.js';
import { ExpenseApp } from './pages/expense-app.js';
import type { WorkflowResult, TaskLog } from './core/dsl/types.js';

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
        if (output) {
          Object.assign(result.outputs, output);
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

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/executor.ts
git commit -m "refactor(executor): import generic types from core"
```

---

### Task 9: 创建 Expense Adapter

**Files:**
- Create: `src/projects/expense/tasks.ts`
- Create: `src/projects/expense/capabilities.ts`
- Create: `src/projects/expense/index.ts`

- [ ] **Step 1: 创建 tasks.ts**

```ts
import { z } from 'zod';

const AuthLoginTask = z.object({
  task: z.literal('auth.login').describe('登录费用管理系统'),
  args: z.object({
    username: z.string().min(1).describe('登录用户名'),
    password: z.string().min(1).describe('登录密码'),
  }),
});

const ProjectCreateTask = z.object({
  task: z.literal('project.create').describe('创建费用分摊项目'),
  args: z.object({
    name: z.string().min(1).describe('项目名称'),
    description: z.string().optional().describe('项目描述'),
    members: z.array(z.string().min(1)).optional().describe('项目成员姓名列表'),
  }),
});

const ProjectAddMembersTask = z.object({
  task: z.literal('project.addMembers').describe('向项目添加成员'),
  args: z.object({
    members: z.array(z.string().min(1)).describe('要添加的成员姓名列表'),
  }),
});

const ExpenseCreateTask = z.object({
  task: z.literal('expense.create').describe('在项目中创建一笔费用记录'),
  args: z.object({
    payer: z.string().min(1).describe('支付人姓名'),
    participants: z.array(z.string().min(1)).min(1).describe('参与分摊的人员姓名列表'),
    amount: z.number().positive().describe('费用金额（元）'),
    category: z.string().min(1).describe('费用类别，如：饮食、交通、住宿、办公'),
    remark: z.string().optional().describe('备注说明'),
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

- [ ] **Step 2: 创建 capabilities.ts**

```ts
import type { Capability } from '../../core/planner/types.js';
import { getCapabilities } from '../../core/planner/registry.js';
import { WorkflowTaskSchema } from './tasks.js';

export function getExpenseCapabilities(): Capability[] {
  return getCapabilities(WorkflowTaskSchema, 'expense');
}
```

- [ ] **Step 3: 创建 index.ts**

```ts
export { WorkflowTaskSchema, WorkflowSchema } from './tasks.js';
export type { WorkflowTask, Workflow } from './tasks.js';
export { getExpenseCapabilities } from './capabilities.js';
```

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/projects/expense/
git commit -m "feat(expense): add expense project adapter with schema and capabilities"
```

---

### Task 10: 迁移测试到 tests/expense/ 和 tests/planner/

**Files:**
- Create: `tests/planner/registry.test.ts`
- Create: `tests/planner/planner.test.ts`
- Create: `tests/expense/workflow.spec.ts`
- Delete: `tests/registry.test.ts`
- Delete: `tests/planner.test.ts`
- Delete: `tests/expense-workflow.spec.ts`

- [ ] **Step 1: 创建 tests/planner/registry.test.ts**

```ts
import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

const caps = getCapabilities(WorkflowTaskSchema, 'expense');

console.assert(caps.length === 4, `Expected 4, got ${caps.length}`);

const tasks = caps.map((c) => c.task);
console.assert(tasks.includes('auth.login'));
console.assert(tasks.includes('project.create'));
console.assert(tasks.includes('project.addMembers'));
console.assert(tasks.includes('expense.create'));

for (const cap of caps) {
  console.assert(cap.description.length > 0, `${cap.task} missing description`);
  console.assert(cap.args.length > 0, `${cap.task} has no args`);
  console.assert(cap.project === 'expense', `${cap.task} project mismatch`);
}

const expenseCap = caps.find((c) => c.task === 'expense.create')!;
const argNames = expenseCap.args.map((a) => a.name);
console.assert(argNames.includes('payer'));
console.assert(argNames.includes('participants'));
console.assert(argNames.includes('amount'));
console.assert(argNames.includes('category'));
console.assert(argNames.includes('remark'));

const remarkArg = expenseCap.args.find((a) => a.name === 'remark')!;
console.assert(remarkArg.required === false);
console.assert(remarkArg.type === 'string');

const amountArg = expenseCap.args.find((a) => a.name === 'amount')!;
console.assert(amountArg.type === 'number');

const participantsArg = expenseCap.args.find((a) => a.name === 'participants')!;
console.assert(participantsArg.type === 'array');

console.log('All registry tests passed');
```

- [ ] **Step 2: 创建 tests/planner/planner.test.ts**

```ts
import { createPlanner } from '../../src/core/planner/planner.js';
import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowSchema, WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

const capabilities = getCapabilities(WorkflowTaskSchema, 'expense');
const planner = createPlanner({ openaiApiKey: 'sk-test' }, capabilities, WorkflowSchema);

const result = await planner.plan('');
console.assert(Array.isArray(result) && result.length === 0, 'Empty input should return empty array');

const badPlanner = createPlanner({ openaiApiKey: 'sk-invalid' }, capabilities, WorkflowSchema);
try {
  await badPlanner.plan('创建一个项目');
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.assert(e instanceof Error);
}

console.log('All planner tests passed');
```

- [ ] **Step 3: 创建 tests/expense/workflow.spec.ts**

```ts
import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { sampleExpenseWorkflow } from '../../src/dsl.js';
import { WorkflowExecutor } from '../../src/executor.js';

test('expense workflow can be executed from structured DSL', async ({ page }) => {
  const workflow = sampleExpenseWorkflow();
  const executor = new WorkflowExecutor(page);

  const result = await executor.run(workflow);

  if (!result.success) {
    console.error('Workflow failed:', JSON.stringify(result.logs, null, 2));
  }
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

- [ ] **Step 4: 删除旧测试文件**

```bash
rm tests/registry.test.ts tests/planner.test.ts tests/expense-workflow.spec.ts
```

- [ ] **Step 5: 运行所有测试**

```bash
npx tsx tests/planner/registry.test.ts
```

Expected: "All registry tests passed"

```bash
npx tsx tests/planner/planner.test.ts
```

Expected: "All planner tests passed"

```bash
npx playwright test tests/expense/workflow.spec.ts --project=chromium
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: reorganize tests into planner/ and expense/ directories"
```

---

### Task 11: 最终验证

- [ ] **Step 1: 完整类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 2: 运行所有测试**

```bash
npx tsx tests/planner/registry.test.ts
npx tsx tests/planner/planner.test.ts
npx playwright test tests/expense/workflow.spec.ts --project=chromium
```

Expected: 全部通过

- [ ] **Step 3: 验证目录结构**

```bash
find src -type f -name '*.ts' | sort
```

Expected: 包含 src/core/, src/projects/expense/, src/planner/cli.ts 等

- [ ] **Step 4: 更新 docs/todo.md 标记 P4 完成**

标记以下完成：
- [x] 将通用能力抽到 src/core/
- [x] 将费用系统迁移为第一个 project adapter
- [x] 设计 Capability 类型和 Capability Registry
- [x] 增加跨项目测试目录结构
- [x] 为 capability 增加 riskLevel

- [ ] **Step 5: Commit**

```bash
git add docs/todo.md
git commit -m "docs: mark P4 multi-project extension tasks as complete"
```
