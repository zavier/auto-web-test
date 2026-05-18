# P2 LLM Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 LLM Planner — 从自然语言生成 DSL JSON，包含 Capability Registry、OpenAI 调用、DSL 修正回路和 CLI 入口。

**Architecture:** 三个新文件：`registry.ts` 从 zod schema 提取 Capability 列表喂给 LLM prompt，`planner.ts` 构建 prompt + 调 OpenAI + 最多 3 轮修正回路，`cli.ts` 薄封装 CLI。修改 `dsl.ts` 给每个 schema 加 `.describe()`。

**Tech Stack:** zod v4（已有）、openai SDK（新增）、TypeScript ESM

---

### Task 1: 安装 openai 依赖

- [ ] **Step 1: Install openai**

```bash
npm install openai
```

- [ ] **Step 2: Verify install**

```bash
node -e "const { OpenAI } = require('openai'); console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openai dependency for LLM Planner"
```

---

### Task 2: 给 zod schema 添加 .describe()

**Files:**
- Modify: `src/dsl.ts`

- [ ] **Step 1: 为每个 task schema 的 task 字面量和 args 字段添加 .describe()**

`src/dsl.ts` 中替换 4 个 task schema 定义：

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
  task: z.literal('expense.create').describe('在项目中创建一笔费用记录，包含支付人、参与人、金额、类别'),
  args: z.object({
    payer: z.string().min(1).describe('支付人姓名'),
    participants: z.array(z.string().min(1)).min(1).describe('参与分摊的人员姓名列表'),
    amount: z.number().positive().describe('费用金额（元）'),
    category: z.string().min(1).describe('费用类别，如：饮食、交通、住宿、办公'),
    remark: z.string().optional().describe('备注说明'),
  }),
});
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 运行已有测试确保未破坏**

```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/dsl.ts
git commit -m "feat(dsl): add .describe() annotations to all task schemas for planner"
```

---

### Task 3: 创建 Capability Registry

**Files:**
- Create: `src/planner/registry.ts`

- [ ] **Step 1: 创建 registry.ts**

```ts
import { WorkflowTaskSchema } from '../dsl.js';
import type { ZodType } from 'zod';

export type ArgMeta = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Capability = {
  task: string;
  description: string;
  args: ArgMeta[];
};

function zodTypeName(schema: ZodType): string {
  const def = schema._zod?.def ?? (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return 'unknown';
  const typeName = def.typeName as string;
  switch (typeName) {
    case 'ZodString': return 'string';
    case 'ZodNumber': return 'number';
    case 'ZodArray': return 'array';
    case 'ZodOptional': return 'optional';
    default: return typeName;
  }
}

function extractArgMeta(shape: Record<string, ZodType>): ArgMeta[] {
  const entries: ArgMeta[] = [];
  for (const [name, schema] of Object.entries(shape)) {
    let inner = schema;
    let required = true;

    // Unwrap ZodOptional
    const innerDef = (inner as Record<string, unknown>)._def as Record<string, unknown> | undefined;
    if (innerDef?.typeName === 'ZodOptional') {
      required = false;
      inner = (inner as { _def: { innerType: ZodType } })._def.innerType;
    }

    const type = zodTypeName(inner);
    const desc = ((inner as Record<string, unknown>)._def as Record<string, unknown> | undefined)
      ?.description as string | undefined ?? '';

    entries.push({ name, type, required, description: desc });
  }
  return entries;
}

export function getCapabilities(): Capability[] {
  const unionDef = (WorkflowTaskSchema as unknown as Record<string, unknown>)._def;
  const options = (unionDef as Record<string, unknown>).options as ZodType[];

  return options.map((option) => {
    const shape = (option as unknown as Record<string, unknown>)._def?.shape as Record<string, ZodType> | undefined;
    if (!shape) throw new Error('Invalid task schema shape');

    const taskSchema = shape['task'];
    const taskLiteralDef = (taskSchema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
    const taskValue = taskLiteralDef?.value as string;
    const taskDesc = (taskLiteralDef?.description as string) ?? '';

    const argsShape = (shape['args'] as unknown as Record<string, unknown>)._def?.shape as Record<string, ZodType> | undefined;
    const args = argsShape ? extractArgMeta(argsShape) : [];

    return { task: taskValue, description: taskDesc, args };
  });
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 创建测试文件验证 registry 提取**

Create: `tests/registry.test.ts`

```ts
import { getCapabilities } from '../src/planner/registry.js';

const caps = getCapabilities();

// 验证提取了 4 个 capability
console.assert(caps.length === 4, `Expected 4 capabilities, got ${caps.length}`);

const tasks = caps.map(c => c.task);
console.assert(tasks.includes('auth.login'), 'Missing auth.login');
console.assert(tasks.includes('project.create'), 'Missing project.create');
console.assert(tasks.includes('project.addMembers'), 'Missing project.addMembers');
console.assert(tasks.includes('expense.create'), 'Missing expense.create');

// 每个 capability 有 description
for (const cap of caps) {
  console.assert(cap.description.length > 0, `${cap.task} missing description`);
  console.assert(cap.args.length > 0, `${cap.task} has no args`);
}

// expense.create 的 args
const expenseCap = caps.find(c => c.task === 'expense.create')!;
const argNames = expenseCap.args.map(a => a.name);
console.assert(argNames.includes('payer'), 'Missing payer arg');
console.assert(argNames.includes('participants'), 'Missing participants arg');
console.assert(argNames.includes('amount'), 'Missing amount arg');
console.assert(argNames.includes('category'), 'Missing category arg');
console.assert(argNames.includes('remark'), 'Missing remark arg');

const remarkArg = expenseCap.args.find(a => a.name === 'remark')!;
console.assert(remarkArg.required === false, 'remark should be optional');

console.log('All registry tests passed');
```

> 注：当前项目无单元测试框架（如 vitest），用裸 `console.assert` 验证，后续 P3 统一迁移。

- [ ] **Step 4: 运行测试**

```bash
npx tsx tests/registry.test.ts
```

Expected: `All registry tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/planner/registry.ts tests/registry.test.ts
git commit -m "feat(planner): add Capability Registry extracting metadata from zod schemas"
```

---

### Task 4: 创建 Planner 核心

**Files:**
- Create: `src/planner/planner.ts`

- [ ] **Step 1: 创建 planner.ts**

```ts
import OpenAI from 'openai';
import type { Workflow } from '../dsl.js';
import { WorkflowSchema } from '../dsl.js';
import { getCapabilities } from './registry.js';

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
  plan(naturalLanguage: string): Promise<Workflow>;
};

function buildSystemMessage(): string {
  const capabilities = getCapabilities();

  const taskList = capabilities.map((cap) => {
    const argList = cap.args
      .map((a) => {
        const required = a.required ? '(必填)' : '(可选)';
        return `    - ${a.name}: ${a.type} ${required} — ${a.description}`;
      })
      .join('\n');
    return `### ${cap.task}\n${cap.description}\n参数：\n${argList}`;
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
6. 输出必须是合法的 JSON 数组`;
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

export function createPlanner(config: PlannerConfig): Planner {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const model = config.model ?? 'gpt-4o';

  async function callLLM(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: 'json_object' },
      timeout: 30_000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new PlannerError('LLM returned empty response', []);
    return content;
  }

  async function plan(naturalLanguage: string): Promise<Workflow> {
    if (!naturalLanguage.trim()) return [];

    const systemMessage = buildSystemMessage();
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
    ];

    let currentInput = naturalLanguage;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      messages.push({ role: 'user', content: currentInput });

      const rawOutput = await callLLM(messages);

      // Parse JSON from LLM output
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

      // If the output is { workflow: [...] } or similar, unwrap it
      const candidate = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)?.workflow;

      const result = WorkflowSchema.safeParse(candidate ?? parsed);
      if (result.success) return result.data;

      currentInput = buildCorrectionPrompt(naturalLanguage, result.error.message);
    }

    throw new PlannerError(
      `DSL generation failed after ${MAX_RETRIES} attempts`,
      messages
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

- [ ] **Step 3: 创建 Planner 测试（需要 OpenAI key，跳过真实调用）**

Create: `tests/planner.test.ts`

```ts
import { createPlanner, PlannerError } from '../src/planner/planner.js';

// 空输入返回空数组
const planner = createPlanner({ openaiApiKey: 'sk-test' });
const result = await planner.plan('');
console.assert(Array.isArray(result) && result.length === 0, 'Empty input should return empty array');

// 缺少 API key 时调用真实 LLM 应失败
const badPlanner = createPlanner({ openaiApiKey: 'sk-invalid' });
try {
  await badPlanner.plan('创建一个项目');
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.assert(e instanceof Error, 'Should throw an error');
}

console.log('All planner tests passed');
```

- [ ] **Step 4: 运行测试**

```bash
npx tsx tests/planner.test.ts
```

Expected: `All planner tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/planner/planner.ts tests/planner.test.ts
git commit -m "feat(planner): add Planner core with OpenAI integration and correction loop"
```

---

### Task 5: 创建 CLI 入口

**Files:**
- Create: `src/planner/cli.ts`

- [ ] **Step 1: 创建 cli.ts**

```ts
import { createPlanner } from './planner.js';
import type { Workflow } from '../dsl.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse --model flag
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
    process.stderr.write('Usage: npx tsx src/planner/cli.ts [--model <model>] "<natural language>"\n');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('Error: OPENAI_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  const planner = createPlanner({ openaiApiKey: apiKey, model });

  try {
    const workflow: Workflow = await planner.plan(input);
    process.stdout.write(JSON.stringify(workflow, null, 2) + '\n');
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 测试 CLI 参数验证**

```bash
npx tsx src/planner/cli.ts 2>&1
```

Expected: 输出 usage 信息到 stderr，退出码 1

```bash
OPENAI_API_KEY=sk-test npx tsx src/planner/cli.ts "test" 2>&1
```

Expected: 因 API key 无效报错（但语法通路已验证）

- [ ] **Step 4: Commit**

```bash
git add src/planner/cli.ts
git commit -m "feat(planner): add CLI entry point for natural language to DSL conversion"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 完整的类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 2: 运行所有测试**

```bash
npx tsx tests/registry.test.ts
```

Expected: `All registry tests passed`

```bash
npx tsx tests/planner.test.ts
```

Expected: `All planner tests passed`

- [ ] **Step 3: 运行已有 E2E 测试确保未退化**

```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

Expected: PASS

- [ ] **Step 4: 更新 docs/todo.md 标记 P2 LLM Planner 部分完成**

- [ ] **Step 5: Commit**

```bash
git add docs/todo.md
git commit -m "docs: mark P2 LLM Planner tasks as complete"
```
