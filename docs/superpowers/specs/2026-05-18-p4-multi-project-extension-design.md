# P4: 多项目扩展设计方案

## 目标

将当前费用系统的验证骨架扩展为多项目架构：
1. 提取通用 Core 层（DSL、Executor、Planner、Capability Registry）
2. 将费用系统迁移为第一个 Project Adapter
3. 定义新项目接入的最小模板（3 个文件）
4. 验证架构可行性

## 架构

```
Natural Language
  → Planner (prompt 构建 + OpenAI 调用)
  → DSL JSON
  → Zod Validator
  → WorkflowExecutor
  → Project Adapter (capability → task 路由)
  → Page Object / Action Library
  → Playwright Runtime
```

## 目录结构

```
src/
  core/
    dsl/
      schema.ts       — 通用 DSL schema 框架
      types.ts        — 通用类型（TaskLog、WorkflowResult 等）
      index.ts        — re-export
    executor/
      executor.ts     — WorkflowExecutor（通用执行引擎）
      index.ts
    planner/
      types.ts        — Capability、ProjectAdapter、ArgMeta 类型
      registry.ts     — Capability Registry（通用提取逻辑）
      planner.ts      — Planner 核心
      cli.ts          — CLI 入口
      index.ts
    capability-registry.ts  — 聚合所有 adapter 的 CapabilityRegistry

  projects/
    expense/
      capabilities.ts     — 费用项目 capability 注册
      tasks.ts            — 费用项目 task schema（zod）
      pages/
        expense-app.ts    — 费用系统 Runtime（从 src/pages 迁移）
      index.ts            — re-export

  dsl.ts              — 兼容层：re-export from core/dsl
  executor.ts         — 兼容层：re-export from core/executor

tests/
  planner/
    registry.test.ts    — Capability Registry 测试
    planner.test.ts     — Planner 测试
  expense/
    workflow.spec.ts    — 费用系统 E2E 测试
```

## Core 层提取

### 提取范围

Core 只包含**通用、无业务**的部分：
- DSL schema **框架**（不是具体 task schema）
- WorkflowExecutor（通用执行引擎）
- Capability Registry（通用提取逻辑）
- Planner（通用 prompt 构建 + OpenAI 调用）

Core **不包含**：
- 具体 task schema（如 `auth.login`、`expense.create`）
- 具体 Runtime 实现（如 `ExpenseApp`）
- 具体 Capability 列表

### 兼容层

保留 `src/dsl.ts` 和 `src/executor.ts` 作为 thin re-export，现有测试和 CLI 无需改 import：

```ts
// src/dsl.ts
export * from './core/dsl/index.js';
```

## Adapter 层设计

### 最小文件（3 个）

每个项目 adapter 最少需要：

1. **`tasks.ts`** — zod schema 定义 + sample workflow
2. **`capabilities.ts`** — Capability 列表注册
3. **`pages/<project>-app.ts`** — Runtime 实现

### Adapter 接口

```ts
export type ProjectAdapter = {
  project: string;
  getCapabilities(): Capability[];
  getTaskSchema(): ZodType;
  createExecutor(page: Page): WorkflowExecutor;
};
```

### 费用系统 Adapter 示例

```ts
// src/projects/expense/capabilities.ts
import { type Capability } from '../../core/planner/index.js';
import { getCapabilities } from './tasks.js';

export const expenseCapabilities: Capability[] = getCapabilities().map(c => ({
  ...c,
  project: 'expense',
  riskLevel: c.task === 'expense.create' ? 'write' : 'write',
}));
```

## Capability 类型

```ts
export type ArgMeta = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Capability = {
  project: string;                    // 所属项目标识
  task: string;                       // 如 "expense.create"
  description: string;
  args: ArgMeta[];
  riskLevel: 'read' | 'write' | 'destructive';
};
```

### riskLevel 作用

仅在 Planner prompt 中提示，不阻止执行。prompt 规则追加：

```
7. 对于 riskLevel 为 'destructive' 的 task，仅在用户明确要求时才使用
```

## CapabilityRegistry

聚合所有 adapter 的 capability，供 Planner 和 Executor 使用：

```ts
export class CapabilityRegistry {
  private adapters: Map<string, ProjectAdapter> = new Map();

  register(adapter: ProjectAdapter): void;
  getAllCapabilities(): Capability[];
  getTaskSchema(taskName: string): ZodType | undefined;
  createExecutor(project: string, page: Page): WorkflowExecutor | undefined;
}
```

## 跨项目 Planner

Planner 初始化时传入 `CapabilityRegistry`，system message 包含所有项目的 capability。当前版本仅支持单项目，后续可扩展。

## 迁移策略（分两步）

### Step 1: 创建 Core 层

1. 创建 `src/core/` 目录结构
2. 将通用代码从 `src/dsl.ts`、`src/executor.ts`、`src/planner/` 迁移到 `src/core/`
3. 修改 `src/dsl.ts` 和 `src/executor.ts` 为 re-export
4. 验证类型检查和所有测试通过
5. 提交

### Step 2: 创建 Expense Adapter

1. 创建 `src/projects/expense/` 目录
2. 将 `src/pages/expense-app.ts` 复制到 `src/projects/expense/pages/`
3. 创建 `src/projects/expense/tasks.ts`（从 `src/dsl.ts` 提取 expense 相关 schema）
4. 创建 `src/projects/expense/capabilities.ts`
5. 修改 `src/executor.ts` 中的 import 指向新位置
6. 迁移测试到 `tests/expense/`
7. 验证所有测试通过
8. 删除旧的 `src/pages/` 和 `tests/expense-workflow.spec.ts`
9. 提交

## 新项目接入流程

1. 用 Playwright codegen 录制核心流程
2. 创建 `src/projects/<name>/` 目录
3. 写 `tasks.ts` 定义 task schema
4. 写 `capabilities.ts` 注册 capability
5. 写 `pages/<name>-app.ts` 实现 Runtime
6. 注册到 `CapabilityRegistry`
7. 写 E2E 测试
8. 跑通后补充恢复策略

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/dsl/schema.ts` | 新增 | 通用 DSL schema 框架 |
| `src/core/dsl/types.ts` | 新增 | 通用类型 |
| `src/core/dsl/index.ts` | 新增 | re-export |
| `src/core/executor/executor.ts` | 新增 | WorkflowExecutor 迁移 |
| `src/core/executor/index.ts` | 新增 | re-export |
| `src/core/planner/types.ts` | 新增 | Capability / ProjectAdapter 类型 |
| `src/core/planner/registry.ts` | 迁移 | 从 `src/planner/registry.ts` |
| `src/core/planner/planner.ts` | 迁移 | 从 `src/planner/planner.ts` |
| `src/core/planner/cli.ts` | 迁移 | 从 `src/planner/cli.ts` |
| `src/core/planner/index.ts` | 新增 | re-export |
| `src/core/capability-registry.ts` | 新增 | CapabilityRegistry 聚合器 |
| `src/projects/expense/capabilities.ts` | 新增 | 费用项目 capability 注册 |
| `src/projects/expense/tasks.ts` | 新增 | 费用项目 task schema |
| `src/projects/expense/pages/expense-app.ts` | 迁移 | 从 `src/pages/expense-app.ts` |
| `src/projects/expense/index.ts` | 新增 | re-export |
| `src/dsl.ts` | 修改 | 改为 re-export from core |
| `src/executor.ts` | 修改 | 改为 re-export from core |
| `src/planner/` | 删除 | 迁移到 `src/core/planner/` |
| `src/pages/` | 删除 | 迁移到 `src/projects/expense/pages/` |
| `tests/registry.test.ts` | 迁移 | 到 `tests/planner/registry.test.ts` |
| `tests/planner.test.ts` | 迁移 | 到 `tests/planner/planner.test.ts` |
| `tests/expense-workflow.spec.ts` | 迁移 | 到 `tests/expense/workflow.spec.ts` |
