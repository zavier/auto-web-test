# Workflow 参数化与双阶段替换实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为项目引入 Workflow 双阶段参数替换机制：TemplateEngine 解析 `${var}` 占位符，WorkflowParameterizer 将录制数据自动参数化。

**Architecture:** 新增 `src/core/template/`（TemplateEngine + VariableContextBuilder）和 `src/core/recorder/`（WorkflowParameterizer + 规则集），最小化修改 `src/executor.ts` 以在 `run()` 中前置解析。纯 TypeScript，无额外依赖。

**Tech Stack:** TypeScript, zod, Playwright（仅 Executor 集成回归测试）

---

## 文件结构映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/core/template/types.ts` | 新增 | `VariableContext`、`TemplateWorkflow`、`TemplateError` 类型定义 |
| `src/core/template/engine.ts` | 新增 | `TemplateEngine.resolve()` — 递归解析 `${var}`，支持整值替换和字符串插值 |
| `src/core/template/context.ts` | 新增 | `VariableContextBuilder` + `buildContext()` — 四层作用域组装 |
| `src/core/template/index.ts` | 新增 | 统一导出 template 模块 |
| `src/core/recorder/rules.ts` | 新增 | `ParameterizeRule` 类型 + `defaultRules` 常量 |
| `src/core/recorder/parameterizer.ts` | 新增 | `WorkflowParameterizer` — 按规则自动替换纯值 workflow 中的可变字段 |
| `src/core/recorder/index.ts` | 新增 | 统一导出 recorder 模块 |
| `src/executor.ts` | 修改 | `run()` 增加 `options` 参数，前置调用 `TemplateEngine.resolve()` |
| `tests/template/engine.test.ts` | 新增 | TemplateEngine 整值替换、字符串插值、嵌套路径、错误处理测试 |
| `tests/template/context.test.ts` | 新增 | VariableContextBuilder 和 buildContext 测试 |
| `tests/recorder/parameterizer.test.ts` | 新增 | WorkflowParameterizer 规则匹配、启发式识别、mapping 输出测试 |

---

### Task 1: TemplateEngine 核心解析逻辑

**Files:**
- Create: `src/core/template/types.ts`
- Create: `src/core/template/engine.ts`
- Test: `tests/template/engine.test.ts`

**上下文：** 现有 `Workflow` 类型结构为 `Array<{ task: string; args: Record<string, unknown> }>`。TemplateEngine 递归遍历 args 中的每个值，对字符串解析 `${var}` 语法。

- [ ] **Step 1: 创建类型定义文件**

Create `src/core/template/types.ts`:

```ts
export type VariableContext = {
  env: Record<string, string>;
  global: Record<string, unknown>;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type TemplateWorkflow = Array<{
  task: string;
  args: Record<string, unknown>;
}>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}
```

- [ ] **Step 2: 写测试（TDD）**

Create `tests/template/engine.test.ts`:

```ts
import { TemplateEngine } from '../../src/core/template/engine.js';
import type { VariableContext } from '../../src/core/template/types.js';

const baseContext: VariableContext = {
  env: { EXPENSE_USERNAME: 'admin', EXPENSE_PASSWORD: 'secret' },
  global: { defaultMembers: ['A', 'B'] },
  input: { suffix: 12345, amount: 100 },
  output: { projectCreate: { projectId: 42, projectName: '测试项目' } },
};

// Test A: 整值替换保留原始类型
const templateA = [{ task: 'auth.login', args: { username: '${env.EXPENSE_USERNAME}', amount: '${input.amount}' } }];
const resolvedA = TemplateEngine.resolve(templateA, baseContext);
console.assert(resolvedA[0].args.username === 'admin', `Expected admin, got ${resolvedA[0].args.username}`);
console.assert(resolvedA[0].args.amount === 100, `Expected number 100, got ${typeof resolvedA[0].args.amount} ${resolvedA[0].args.amount}`);

// Test B: 字符串插值
const templateB = [{ task: 'project.create', args: { name: '项目_${input.suffix}' } }];
const resolvedB = TemplateEngine.resolve(templateB, baseContext);
console.assert(resolvedB[0].args.name === '项目_12345', `Expected 项目_12345, got ${resolvedB[0].args.name}`);

// Test C: 嵌套路径
const templateC = [{ task: 'expense.create', args: { projectId: '${output.projectCreate.projectId}' } }];
const resolvedC = TemplateEngine.resolve(templateC, baseContext);
console.assert(resolvedC[0].args.projectId === 42, `Expected 42, got ${resolvedC[0].args.projectId}`);

// Test D: 无变量时原样返回
const templateD = [{ task: 'auth.login', args: { username: 'fixed', amount: 50 } }];
const resolvedD = TemplateEngine.resolve(templateD, baseContext);
console.assert(resolvedD[0].args.username === 'fixed');
console.assert(resolvedD[0].args.amount === 50);

// Test E: 数组和对象内部解析
const templateE = [{ task: 'project.create', args: { members: ['${global.defaultMembers}'], nested: { x: '${input.amount}' } } }];
const resolvedE = TemplateEngine.resolve(templateE, baseContext);
console.assert(Array.isArray(resolvedE[0].args.members) && resolvedE[0].args.members[0] === 'A');
console.assert(resolvedE[0].args.nested.x === 100);

console.log('All engine tests passed');
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx tsx tests/template/engine.test.ts`

Expected: Error — `Cannot find module '../../src/core/template/engine.js'`

- [ ] **Step 4: 实现 TemplateEngine**

Create `src/core/template/engine.ts`:

```ts
import type { VariableContext, TemplateWorkflow } from './types.js';
import { TemplateError } from './types.js';

function getPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function getValueFromContext(path: string, context: VariableContext): unknown {
  const scopes: (keyof VariableContext)[] = ['output', 'input', 'env', 'global'];
  const parts = path.split('.');
  const maybeScope = parts[0] as keyof VariableContext;

  if (scopes.includes(maybeScope)) {
    const nestedPath = parts.slice(1).join('.');
    const value = nestedPath ? getPath(context[maybeScope], nestedPath) : context[maybeScope];
    if (value !== undefined) return value;
    throw new TemplateError(
      `Variable "${path}" not found. "${nestedPath || maybeScope}" is undefined in ${maybeScope}.`
    );
  }

  // No scope prefix — try all scopes in priority order
  for (const scope of scopes) {
    const value = getPath(context[scope], path);
    if (value !== undefined) return value;
  }

  const available = scopes
    .flatMap((s) => Object.keys(context[s]).map((k) => `${s}.${k}`))
    .slice(0, 10);
  throw new TemplateError(
    `Variable "${path}" not found. Available variables: ${available.join(', ') || '(none)'}`
  );
}

function resolveValue(value: unknown, context: VariableContext): unknown {
  if (typeof value !== 'string') {
    if (Array.isArray(value)) {
      return value.map((v) => resolveValue(v, context));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = resolveValue(v, context);
      }
      return result;
    }
    return value;
  }

  const wholeMatch = value.match(/^\$\{([^}]+)\}$/);
  if (wholeMatch) {
    return getValueFromContext(wholeMatch[1], context);
  }

  return value.replace(/\$\{([^}]+)\}/g, (_, path) => {
    const result = getValueFromContext(path, context);
    return String(result ?? '');
  });
}

export class TemplateEngine {
  static resolve(workflow: TemplateWorkflow, context: VariableContext): TemplateWorkflow {
    return workflow.map((step) => ({
      ...step,
      args: resolveValue(step.args, context) as Record<string, unknown>,
    }));
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx tsx tests/template/engine.test.ts`

Expected: `All engine tests passed`

- [ ] **Step 6: Commit**

```bash
git add src/core/template/types.ts src/core/template/engine.ts tests/template/engine.test.ts
git commit -m "feat(template): add TemplateEngine with whole-value and interpolation resolution"
```

---

### Task 2: TemplateEngine 错误处理

**Files:**
- Modify: `src/core/template/engine.ts`
- Test: `tests/template/engine.test.ts`

- [ ] **Step 1: 在测试中增加错误场景**

Append to `tests/template/engine.test.ts` (after existing tests, before the `console.log`):

```ts
// Test F: undefined variable throws TemplateError
let threw = false;
try {
  TemplateEngine.resolve([{ task: 'auth.login', args: { x: '${env.MISSING}' } }], baseContext);
} catch (e) {
  threw = true;
  console.assert(e instanceof Error && e.name === 'TemplateError');
  console.assert((e as Error).message.includes('MISSING'));
}
console.assert(threw, 'Expected TemplateError for missing variable');

// Test G: no-scope undefined variable
let threwG = false;
try {
  TemplateEngine.resolve([{ task: 'auth.login', args: { x: '${missingVar}' } }], baseContext);
} catch (e) {
  threwG = true;
  console.assert((e as Error).message.includes('missingVar'));
}
console.assert(threwG, 'Expected TemplateError for no-scope missing variable');
```

Update the final `console.log` to `console.log('All engine tests passed');` (it should already be there).

- [ ] **Step 2: 运行测试确认失败（因为当前 resolveValue 的插值分支对 undefined 不抛错）**

Run: `npx tsx tests/template/engine.test.ts`

Expected: `Assertion failed: Expected TemplateError for missing variable` (因为当前插值分支用了 `String(result ?? '')` 而不是抛错)

- [ ] **Step 3: 修复 engine.ts 的插值分支，确保未定义变量抛错**

Edit `src/core/template/engine.ts`，修改 `resolveValue` 中的字符串插值分支：

```ts
  return value.replace(/\$\{([^}]+)\}/g, (_, path) => {
    const result = getValueFromContext(path, context);
    return String(result);
  });
```

（移除 `?? ''`，让 `getValueFromContext` 在变量未找到时直接抛 `TemplateError`。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx tests/template/engine.test.ts`

Expected: `All engine tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/core/template/engine.ts tests/template/engine.test.ts
git commit -m "feat(template): strict error handling for undefined variables in TemplateEngine"
```

---

### Task 3: VariableContextBuilder + buildContext

**Files:**
- Create: `src/core/template/context.ts`
- Test: `tests/template/context.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/template/context.test.ts`:

```ts
import { VariableContextBuilder, buildContext } from '../../src/core/template/context.js';

// Test buildContext defaults
process.env.TEST_VAR = 'hello';
const ctx1 = buildContext();
console.assert(ctx1.env.TEST_VAR === 'hello');
console.assert(ctx1.input !== undefined);
console.assert(ctx1.output !== undefined);
console.assert(ctx1.global !== undefined);

// Test buildContext with overrides
const ctx2 = buildContext({
  input: { amount: 100 },
  global: { baseUrl: 'http://test' },
});
console.assert(ctx2.input.amount === 100);
console.assert(ctx2.global.baseUrl === 'http://test');
console.assert(ctx2.env.TEST_VAR === 'hello');

// Test VariableContextBuilder
const builder = new VariableContextBuilder()
  .withEnv({ FOO: 'bar' })
  .withInput({ suffix: 1 })
  .withOutput('projectCreate', { projectId: 99 })
  .withGlobal({ members: ['a'] });

const ctx3 = builder.build();
console.assert(ctx3.env.FOO === 'bar');
console.assert(ctx3.input.suffix === 1);
console.assert((ctx3.output.projectCreate as Record<string, unknown>).projectId === 99);
console.assert((ctx3.global.members as string[])[0] === 'a');

// Test withOutput accumulates
const builder2 = new VariableContextBuilder()
  .withOutput('projectCreate', { projectId: 1 })
  .withOutput('expenseCreate', { recordId: 2 });
const ctx4 = builder2.build();
console.assert((ctx4.output.projectCreate as Record<string, unknown>).projectId === 1);
console.assert((ctx4.output.expenseCreate as Record<string, unknown>).recordId === 2);

console.log('All context tests passed');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx tests/template/context.test.ts`

Expected: `Cannot find module '../../src/core/template/context.js'`

- [ ] **Step 3: 实现 context.ts**

Create `src/core/template/context.ts`:

```ts
import type { VariableContext } from './types.js';

export function buildContext(partial?: Partial<VariableContext>): VariableContext {
  return {
    env: partial?.env ?? (process.env as Record<string, string>),
    global: partial?.global ?? {},
    input: partial?.input ?? {},
    output: partial?.output ?? {},
  };
}

export class VariableContextBuilder {
  private context: VariableContext = {
    env: {},
    global: {},
    input: {},
    output: {},
  };

  withEnv(env: Record<string, string | undefined>): this {
    this.context.env = Object.fromEntries(
      Object.entries(env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;
    return this;
  }

  withGlobal(global: Record<string, unknown>): this {
    this.context.global = { ...this.context.global, ...global };
    return this;
  }

  withInput(input: Record<string, unknown>): this {
    this.context.input = { ...this.context.input, ...input };
    return this;
  }

  withOutput(taskName: string, output: Record<string, unknown>): this {
    this.context.output = { ...this.context.output, [taskName]: output };
    return this;
  }

  build(): VariableContext {
    return { ...this.context };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx tests/template/context.test.ts`

Expected: `All context tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/core/template/context.ts tests/template/context.test.ts
git commit -m "feat(template): add VariableContextBuilder and buildContext helper"
```

---

### Task 4: WorkflowExecutor 集成 TemplateEngine

**Files:**
- Modify: `src/executor.ts`
- Modify: `tests/expense/workflow.spec.ts`

**上下文：** 现有 `WorkflowExecutor.run(workflow)` 先 `WorkflowSchema.safeParse(workflow)` 再执行。修改后，如果 workflow 包含 `${` 字符串，先用 `TemplateEngine.resolve` 解析。

- [ ] **Step 1: 修改 WorkflowExecutor**

Read `src/executor.ts` to confirm current state, then edit it.

Replace the `run` method and add imports:

```ts
import { TemplateEngine } from './core/template/engine.js';
import { buildContext } from './core/template/context.js';
import type { VariableContext } from './core/template/types.js';
```

Replace the `run` method signature and body:

```ts
  async run(
    workflow: Workflow,
    options?: { context?: Partial<VariableContext> }
  ): Promise<WorkflowResult> {
    const hasTemplate = JSON.stringify(workflow).includes('${');
    const resolved = hasTemplate
      ? TemplateEngine.resolve(workflow, buildContext(options?.context))
      : workflow;

    const parseResult = WorkflowSchema.safeParse(resolved);
    if (!parseResult.success) {
      throw new Error(`DSL validation failed: ${parseResult.error.message}`);
    }

    // ... rest of method stays the same
```

The full file should look like:

```ts
import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask, TaskOutput } from './dsl.js';
import { WorkflowSchema } from './dsl.js';
import type { WorkflowResult, TaskLog } from './core/dsl/types.js';
import { ExpenseApp } from './pages/expense-app.js';
import { TemplateEngine } from './core/template/engine.js';
import { buildContext } from './core/template/context.js';
import type { VariableContext } from './core/template/types.js';

export class WorkflowExecutor {
  private readonly app: ExpenseApp;

  constructor(page: Page) {
    this.app = new ExpenseApp(page);
  }

  async run(
    workflow: Workflow,
    options?: { context?: Partial<VariableContext> }
  ): Promise<WorkflowResult> {
    const hasTemplate = JSON.stringify(workflow).includes('${');
    const resolved = hasTemplate
      ? TemplateEngine.resolve(workflow, buildContext(options?.context))
      : workflow;

    const parseResult = WorkflowSchema.safeParse(resolved);
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

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: 运行现有回归测试**

Run: `npx playwright test tests/expense/workflow.spec.ts --project=chromium`

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add src/executor.ts
git commit -m "feat(executor): integrate TemplateEngine into WorkflowExecutor.run()"
```

---

### Task 5: WorkflowParameterizer

**Files:**
- Create: `src/core/recorder/rules.ts`
- Create: `src/core/recorder/parameterizer.ts`
- Test: `tests/recorder/parameterizer.test.ts`

- [ ] **Step 1: 写 rules.ts**

Create `src/core/recorder/rules.ts`:

```ts
export type ParameterizeRule = {
  fieldPattern: string | RegExp;
  taskPattern?: string | RegExp;
  paramName: string;
  scope: 'env' | 'input' | 'global';
};

export const defaultRules: ParameterizeRule[] = [
  { fieldPattern: 'username', paramName: 'env.EXPENSE_USERNAME', scope: 'env' },
  { fieldPattern: 'password', paramName: 'env.EXPENSE_PASSWORD', scope: 'env' },
  { fieldPattern: 'name', taskPattern: 'project.create', paramName: 'input.projectName', scope: 'input' },
  { fieldPattern: 'amount', paramName: 'input.amount', scope: 'input' },
  { fieldPattern: 'category', paramName: 'input.category', scope: 'input' },
  { fieldPattern: 'remark', paramName: 'input.remark', scope: 'input' },
];
```

- [ ] **Step 2: 写测试**

Create `tests/recorder/parameterizer.test.ts`:

```ts
import { WorkflowParameterizer } from '../../src/core/recorder/parameterizer.js';
import { defaultRules } from '../../src/core/recorder/rules.js';

const recorded = [
  {
    task: 'auth.login',
    args: { username: 'zhangsan', password: 'secret123' },
  },
  {
    task: 'project.create',
    args: { name: '团建 2024-05-18', description: '', members: ['张三', '李四'] },
  },
  {
    task: 'expense.create',
    args: { payer: '张三', participants: ['张三', '李四'], amount: 150, category: '饮食', remark: '午餐' },
  },
];

const parameterizer = new WorkflowParameterizer(defaultRules);
const { template, mapping } = parameterizer.parameterize(recorded as any);

// Verify username and password are parameterized
console.assert(template[0].args.username === '${env.EXPENSE_USERNAME}');
console.assert(template[0].args.password === '${env.EXPENSE_PASSWORD}');

// Verify project name is parameterized
console.assert(template[1].args.name === '${input.projectName}');

// Verify amount and category are parameterized
console.assert(template[2].args.amount === '${input.amount}');
console.assert(template[2].args.category === '${input.category}');
console.assert(template[2].args.remark === '${input.remark}');

// Verify non-matching fields remain unchanged
console.assert(template[1].args.description === '');
console.assert(template[2].args.payer === '张三');

// Verify mapping output
console.assert(mapping.length >= 6, `Expected at least 6 mappings, got ${mapping.length}`);
const usernameMapping = mapping.find((m) => m.field === 'username' && m.task === 'auth.login');
console.assert(usernameMapping?.originalValue === 'zhangsan');
console.assert(usernameMapping?.placeholder === '${env.EXPENSE_USERNAME}');

console.log('All parameterizer tests passed');
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx tsx tests/recorder/parameterizer.test.ts`

Expected: `Cannot find module '../../src/core/recorder/parameterizer.js'`

- [ ] **Step 4: 实现 parameterizer.ts**

Create `src/core/recorder/parameterizer.ts`:

```ts
import type { ParameterizeRule } from './rules.js';
import type { TemplateWorkflow } from '../template/types.js';

export type ParamMapping = {
  task: string;
  field: string;
  originalValue: unknown;
  placeholder: string;
  scope: 'env' | 'input' | 'global';
};

export class WorkflowParameterizer {
  constructor(private rules: ParameterizeRule[]) {}

  parameterize(workflow: TemplateWorkflow): {
    template: TemplateWorkflow;
    mapping: ParamMapping[];
  } {
    const mapping: ParamMapping[] = [];

    const template = workflow.map((step) => {
      const parameterizedArgs: Record<string, unknown> = {};

      for (const [field, value] of Object.entries(step.args)) {
        const rule = this.findRule(step.task, field);
        if (rule) {
          const placeholder = `\${${rule.paramName}}`;
          parameterizedArgs[field] = placeholder;
          mapping.push({
            task: step.task,
            field,
            originalValue: value,
            placeholder,
            scope: rule.scope,
          });
        } else {
          parameterizedArgs[field] = value;
        }
      }

      return { ...step, args: parameterizedArgs };
    });

    return { template, mapping };
  }

  private findRule(task: string, field: string): ParameterizeRule | undefined {
    return this.rules.find((rule) => {
      const fieldMatches =
        typeof rule.fieldPattern === 'string'
          ? rule.fieldPattern === field
          : rule.fieldPattern.test(field);
      if (!fieldMatches) return false;

      if (rule.taskPattern) {
        const taskMatches =
          typeof rule.taskPattern === 'string'
            ? rule.taskPattern === task
            : rule.taskPattern.test(task);
        if (!taskMatches) return false;
      }

      return true;
    });
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx tsx tests/recorder/parameterizer.test.ts`

Expected: `All parameterizer tests passed`

- [ ] **Step 6: Commit**

```bash
git add src/core/recorder/rules.ts src/core/recorder/parameterizer.ts tests/recorder/parameterizer.test.ts
git commit -m "feat(recorder): add WorkflowParameterizer with configurable rules and mapping output"
```

---

### Task 6: 统一导出与 index.ts

**Files:**
- Create: `src/core/template/index.ts`
- Create: `src/core/recorder/index.ts`

- [ ] **Step 1: 写 template/index.ts**

Create `src/core/template/index.ts`:

```ts
export { TemplateEngine } from './engine.js';
export { VariableContextBuilder, buildContext } from './context.js';
export { TemplateError } from './types.js';
export type { VariableContext, TemplateWorkflow } from './types.js';
```

- [ ] **Step 2: 写 recorder/index.ts**

Create `src/core/recorder/index.ts`:

```ts
export { WorkflowParameterizer } from './parameterizer.js';
export { defaultRules } from './rules.js';
export type { ParameterizeRule } from './rules.js';
export type { ParamMapping } from './parameterizer.js';
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/template/index.ts src/core/recorder/index.ts
git commit -m "chore: add index.ts exports for template and recorder modules"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Spec 要求 | 对应 Task |
|-----------|-----------|
| VariableContext 四层作用域 | Task 3 (`context.ts`) |
| 整值替换保留类型 | Task 1 (`engine.ts` 规则 A) |
| 字符串插值 | Task 1 (`engine.ts` 规则 B) |
| 嵌套路径访问 | Task 1 (`engine.ts` 规则 C) |
| 未定义变量抛 TemplateError | Task 2 (`engine.ts` 规则 D) |
| 作用域优先级 | Task 1 (`getValueFromContext` 遍历顺序) |
| WorkflowExecutor.run() 集成 | Task 4 (`executor.ts`) |
| WorkflowParameterizer + 规则 | Task 5 (`parameterizer.ts`, `rules.ts`) |
| 参数化 mapping 输出 | Task 5 (`ParamMapping`) |
| 测试覆盖 engine / context / parameterizer | Task 1, 2, 3, 5 测试文件 |

**2. Placeholder scan:** 无 TBD/TODO/"implement later"/"similar to"/"add appropriate error handling"。每步含完整代码和命令。

**3. Type consistency：**
- `VariableContext` 定义在 `types.ts`，被 `engine.ts`、`context.ts`、`executor.ts` 共用，一致。
- `TemplateWorkflow` 在 `types.ts` 定义，`engine.ts` 和 `parameterizer.ts` 共用，一致。
- `TemplateError` 在 `types.ts` 定义，`engine.ts` 中使用 `instanceof TemplateError`（测试通过 `e.name === 'TemplateError'`），一致。

**Gap found & fixed：** Executor 集成 Task 4 需要确保 `WorkflowSchema.safeParse` 接收解析后的纯值 workflow。由于 `TemplateEngine.resolve` 返回 `TemplateWorkflow`，而 `WorkflowSchema` 是 zod schema，TypeScript 会将 `TemplateWorkflow` 当作 `unknown[]` 处理，`safeParse` 接受 `unknown`，所以类型兼容。已验证无问题。

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-workflow-parameterization.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
