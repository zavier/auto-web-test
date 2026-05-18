# Workflow 参数化与双阶段替换设计文档

## 背景与目标

当前项目支持 LLM Planner 生成结构化 DSL workflow，以及人工编写 `sampleExpenseWorkflow` 执行。两种方式生成的 workflow 都包含**硬编码的具体参数值**（如用户名、密码、项目名称、金额等）。实际使用中，这些值几乎总是需要替换：

- **凭据**：不同环境使用不同账号密码
- **测试数据**：每次运行需要不重复的项目名、金额、备注
- **任务间传递**：`project.create` 返回的 `projectId` 需要被后续 task 引用
- **录制回放**：Playwright 等工具录制原始操作后，其中包含的具体值无法直接复用

本设计引入**双阶段参数替换机制**：

1. **录制/模板阶段**：将纯值 workflow 转换为带占位符的 Template Workflow
2. **执行阶段**：将 Template Workflow 解析为纯值 workflow，再交由现有 Executor 执行

## 设计原则

- **兼容现有 DSL**：Template Workflow 的结构与现有 `Workflow` 完全一致，仅允许字符串值中出现 `${var}` 语法
- **类型安全优先**：整值替换时保留原始类型（`${input.amount}` → `number`），字符串插值时才做拼接
- **层级作用域**：变量分四层（output > input > env > global），优先级明确，避免命名冲突
- **最小侵入**：`WorkflowExecutor.run()` 增加可选参数，不破坏现有调用方
- **可配置规则**：录制阶段的参数化规则通过 `ParameterizeRule[]` 传入，支持项目自定义

## 架构变化概览

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/template/types.ts` | 新增 | `VariableContext`、`TemplateEngineOptions` 类型 |
| `src/core/template/engine.ts` | 新增 | `TemplateEngine`：递归解析 `${var}`，支持整值替换和字符串插值 |
| `src/core/template/context.ts` | 新增 | `VariableContext` 构建器，管理 env/input/output/global 四层作用域 |
| `src/core/recorder/parameterizer.ts` | 新增 | `WorkflowParameterizer`：自动识别可变值并参数化 |
| `src/core/recorder/rules.ts` | 新增 | 默认参数化规则集（敏感字段、动态字段） |
| `src/executor.ts` | 编辑 | `run()` 增加 `options?: { context?: Partial<VariableContext> }` 参数 |
| `src/core/dsl/types.ts` | 编辑 | 新增 `TemplateWorkflow = Workflow` 类型别名（语义标注） |

## Template Engine 设计 (`src/core/template/`)

### VariableContext 层级结构

```ts
type VariableContext = {
  env:    Record<string, string>;   // 进程环境变量，如 EXPENSE_USERNAME
  global: Record<string, unknown>;  // 全局常量，如 baseUrl、默认成员列表
  input:  Record<string, unknown>;  // 执行时传入，如 projectName、amount
  output: Record<string, unknown>;  // 上游 task 输出，如 projectCreate.projectId
};
```

**作用域优先级**：`output` > `input` > `env` > `global`。同名变量优先取高优先级作用域的值。

**变量引用语法**：

| 前缀 | 示例 | 来源 |
|------|------|------|
| `env.` | `${env.EXPENSE_USERNAME}` | `process.env` |
| `global.` | `${global.defaultMembers}` | 全局配置对象 |
| `input.` | `${input.projectName}` | `executor.run(workflow, { context: { input: {...} } })` |
| `output.` | `${output.projectCreate.projectId}` | 上游已执行 task 的返回值 |

**output 命名约定**：task 名中的 `.` 替换为驼峰。如 `project.create` → `projectCreate`，`expense.create` → `expenseCreate`。

### TemplateEngine API

```ts
export class TemplateEngine {
  static resolve(
    workflow: Workflow,
    context: VariableContext
  ): Workflow;
}
```

### 替换规则

**规则 A：整值替换（Whole-value replacement）**

如果字符串值**仅包含**一个 `${var}`（前后无其他字符），替换为变量的**原始类型**，不做字符串化：

```ts
// Template Workflow
{ "args": { "amount": "${input.amount}" } }

// context: { input: { amount: 100 } }
// Resolved Workflow
{ "args": { "amount": 100 } }   // 保持 number 类型
```

**规则 B：字符串插值（String interpolation）**

如果 `${var}` 嵌入在字符串中，做字符串拼接：

```ts
// Template Workflow
{ "args": { "name": "测试项目_${input.suffix}" } }

// context: { input: { suffix: 12345 } }
// Resolved Workflow
{ "args": { "name": "测试项目_12345" } }
```

**规则 C：嵌套路径支持**

支持多级路径访问，类型保留：

```ts
{ "args": { "projectId": "${output.projectCreate.projectId}" } }
// 如果 projectCreate.projectId 是 number，解析后仍为 number
```

**规则 D：未定义变量**

变量未找到时抛出 `TemplateError`，包含变量名和当前可用上下文摘要（前 5 个变量名），便于调试。

### 递归解析实现

TemplateEngine 递归遍历 workflow 的每个 args 值：

1. 遇到非字符串值（number、boolean、array、object）→ 原样返回
2. 遇到字符串值 → 用正则 `/^\$\{([^}]+)\}$/` 判断是否整值替换
3. 整值匹配 → 按 `.` 分割路径，逐层从 VariableContext 取值
4. 非整值 → 用正则 `/\$\{([^}]+)\}/g` 全局替换为字符串

## Context 构建器设计 (`src/core/template/context.ts`)

### VariableContextBuilder

```ts
export class VariableContextBuilder {
  private context: VariableContext = {
    env: {},
    global: {},
    input: {},
    output: {},
  };

  withEnv(env: Record<string, string | undefined>): this;
  withGlobal(global: Record<string, unknown>): this;
  withInput(input: Record<string, unknown>): this;
  withOutput(taskName: string, output: Record<string, unknown>): this;

  build(): VariableContext;
}
```

### 与 Executor 的集成

`WorkflowExecutor.run()` 的入口扩展：

```ts
async run(
  workflow: Workflow,
  options?: { context?: Partial<VariableContext> }
): Promise<WorkflowResult> {
  // 1. 如果是 Template Workflow（含 ${var}），先解析
  const hasTemplate = JSON.stringify(workflow).includes('${');
  const resolved = hasTemplate
    ? TemplateEngine.resolve(workflow, this.buildContext(options?.context))
    : workflow;

  // 2. 然后走现有的 zod 校验 + 执行逻辑
  return this.runResolved(resolved);
}

private buildContext(partial?: Partial<VariableContext>): VariableContext {
  return {
    env: partial?.env ?? (process.env as Record<string, string>),
    global: partial?.global ?? {},
    input: partial?.input ?? {},
    output: partial?.output ?? {},
  };
}
```

Task 执行过程中，每完成一个 task，将其 output 写入 context 供后续 task 引用：

```ts
const output = await this.runTask(step);
if (output) {
  const camelName = step.task.replace(/\.(\w)/g, (_, c) => c.toUpperCase());
  context.output[camelName] = output;
}
```

## 录制阶段参数化设计 (`src/core/recorder/`)

### WorkflowParameterizer

录制工具生成的是**纯值 Workflow**（如 `username: "zhangsan"`、`amount: 100`）。`WorkflowParameterizer` 自动识别其中需要替换的值，生成 Template Workflow。

```ts
export type ParameterizeRule = {
  fieldPattern: string | RegExp;   // 字段名匹配，如 "username", "password", /.*Name/
  taskPattern?: string | RegExp;   // 可选：限定 task 范围
  paramName: string;               // 生成的占位符名称
  scope: 'env' | 'input' | 'global';
};

export class WorkflowParameterizer {
  constructor(private rules: ParameterizeRule[] = defaultRules) {}

  parameterize(workflow: Workflow): {
    template: Workflow;
    mapping: ParamMapping[];
  };
}

type ParamMapping = {
  task: string;
  field: string;
  originalValue: unknown;
  placeholder: string;
  scope: 'env' | 'input' | 'global';
};
```

### 默认规则集

```ts
export const defaultRules: ParameterizeRule[] = [
  { fieldPattern: 'username', paramName: 'env.EXPENSE_USERNAME', scope: 'env' },
  { fieldPattern: 'password', paramName: 'env.EXPENSE_PASSWORD', scope: 'env' },
  { fieldPattern: 'name', taskPattern: 'project.create', paramName: 'input.projectName', scope: 'input' },
  { fieldPattern: 'amount', paramName: 'input.amount', scope: 'input' },
  { fieldPattern: 'category', paramName: 'input.category', scope: 'input' },
  { fieldPattern: 'remark', paramName: 'input.remark', scope: 'input' },
];
```

### 自动识别启发式（可选扩展）

`WorkflowParameterizer` 支持启发式自动识别，降低配置负担：

- 字符串值包含当前日期/时间格式 → 标记为 `${input.suffix}`
- 字符串值在多个 task 中重复出现 → 提取为 `${global.xxx}`
- 字段名包含 `id`, `token`, `key`, `secret` → 标记为 `env`
- 数组长度 > 3 的同质字符串列表 → 标记为 `global`（如默认成员列表）

启发式规则与显式规则可组合使用：显式规则优先，未匹配的走启发式。

### 参数化流程

```
纯值 Workflow
  → 遍历每个 task 的 args
  → 按规则匹配字段名 + task 名
  → 匹配成功：替换为 ${scope.paramName}，记录 mapping
  → 匹配失败：保留原值（或走启发式）
  → 返回 { template: Workflow, mapping: ParamMapping[] }
```

mapping 数组可用于 UI 展示或人工审核：确认哪些值被参数化了、占位符是否正确。

## 错误处理

| 场景 | 错误类型 | 行为 |
|------|---------|------|
| 变量未定义 | `TemplateError` | 抛错，消息包含变量名和可用上下文摘要 |
| 路径访问越界 | `TemplateError` | 抛错，如 `Cannot access "projectId" on undefined` |
| 整值替换后类型不匹配 zod | `Error` (from zod) | 正常进入 `WorkflowSchema.safeParse()` 错误流程 |
| 循环依赖（output 引用自身） | 视为未定义 | 执行时 output 中尚无该 task 的 key，`TemplateError` |

## 测试策略

| 测试文件 | 覆盖内容 |
|----------|----------|
| `tests/template/engine.test.ts` | 整值替换（类型保留）、字符串插值、嵌套路径、未定义变量抛错 |
| `tests/template/context.test.ts` | 层级优先级、builder API、output 累积 |
| `tests/recorder/parameterizer.test.ts` | 默认规则匹配、自定义规则、启发式识别、mapping 输出 |
| `tests/expense/workflow-template.spec.ts` | Template Workflow → Engine → Executor 端到端集成 |

## 使用示例

### 示例 1：手工编写 Template Workflow

```ts
const templateWorkflow: Workflow = [
  {
    task: 'auth.login',
    args: {
      username: '${env.EXPENSE_USERNAME}',
      password: '${env.EXPENSE_PASSWORD}',
    },
  },
  {
    task: 'project.create',
    args: {
      name: '测试项目_${input.suffix}',
      description: '自动化测试',
      members: '${global.defaultMembers}',
    },
  },
  {
    task: 'expense.create',
    args: {
      payer: '自动化1号',
      participants: '${global.defaultMembers}',
      amount: '${input.amount}',
      category: '饮食',
      remark: '测试费用',
    },
  },
];

const executor = new WorkflowExecutor(page);
const result = await executor.run(templateWorkflow, {
  context: {
    input: { suffix: Date.now(), amount: 100 },
    global: { defaultMembers: ['自动化1号', '自动化2号'] },
  },
});
```

### 示例 2：录制后参数化

```ts
// 录制工具生成的纯值 workflow
const recorded = [
  { task: 'auth.login', args: { username: 'zhangsan', password: 'secret123' } },
  { task: 'project.create', args: { name: '团建 2024-05-18', description: '', members: ['张三', '李四'] } },
];

const parameterizer = new WorkflowParameterizer();
const { template, mapping } = parameterizer.parameterize(recorded);
// template:
//   username → "${env.EXPENSE_USERNAME}"
//   password → "${env.EXPENSE_PASSWORD}"
//   name     → "${input.projectName}"
//   members  → "${global.defaultMembers}" (启发式：重复出现的数组)
```

### 示例 3：任务间参数传递

```ts
const workflow: Workflow = [
  { task: 'auth.login', args: { username: '${env.EXPENSE_USERNAME}', password: '${env.EXPENSE_PASSWORD}' } },
  { task: 'project.create', args: { name: '项目A', description: '', members: [] } },
  { task: 'project.addMembers', args: { members: ['王五'] } },
  // 假设 future task 需要引用 projectId：
  // { task: 'expense.create', args: { ..., projectId: '${output.projectCreate.projectId}' } },
];
```

## 后续扩展点

| 扩展 | 时机 | 说明 |
|------|------|------|
| 支持 `${output.xxx}` 在更多 task 中使用 | P2 | 当前 `expense.create` 未返回 `recordId`，扩展后可引用 |
| 录制工具集成 | P3 | 等录制模块实现后，直接调用 `WorkflowParameterizer` |
| 条件表达式 | 远期 | 如 `${input.amount > 100 ? '大额' : '小额'}`，当前 YAGNI |
| 变量类型校验 | 远期 | TemplateEngine 解析后做类型断言，不匹配则提前报错 |
