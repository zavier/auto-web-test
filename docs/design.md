# 项目设计方案

## 目标

验证一种"AI 规划 + 确定性执行"的 Web 自动化测试工作流。

核心原则：

```text
LLM 负责理解用户意图并生成 DSL
Executor 负责解释 DSL
Runtime 负责稳定执行、等待、重试、认证、截图和结果判断
Playwright 负责页面/API 操作
```

避免让 LLM 在运行时直接一步步控制浏览器。

## 标准流程

```text
1. 先使用 Playwright codegen 录制核心业务流程
2. 将录制脚本工程化为可复用的 Task / Action / Locator / DSL
3. 实际用户输入自然语言时，LLM Planner 只负责生成结构化 DSL
4. WorkflowExecutor / Runtime 负责执行 DSL
5. LLM 只在有限场景介入：异常恢复、语义判断、locator 修复、业务分支澄清
```

## 当前架构

```text
src/
  core/                      ← 通用层（跨项目复用）
    dsl/
      types.ts               — TaskLog, WorkflowResult, TaskOutput
    planner/
      types.ts               — Capability, ProjectAdapter, ArgMeta
      registry.ts            — 从 zod schema 提取 capability
      planner.ts             — OpenAI 调用 + prompt + 修正回路
      cli.ts                 — 通用 CLI stub
    capability-registry.ts   — 聚合所有 adapter 的 CapabilityRegistry

  projects/                  ← 业务适配层
    expense/
      tasks.ts               — zod schema（AuthLoginTask, ProjectCreateTask...）
      capabilities.ts        — capability 注册
      pages/
        expense-app.ts       — Runtime 实现

  dsl.ts                     — 兼容层：re-export core 类型 + 费用系统 schema
  executor.ts                — 兼容层：费用系统 WorkflowExecutor
  planner/
    cli.ts                   — 费用系统特定 CLI
    registry.ts              — 旧 registry（待清理）
    planner.ts               — 旧 planner（待清理）

tests/
  planner/
    registry.test.ts         — Capability Registry 测试
    planner.test.ts          — Planner 测试
  expense/
    workflow.spec.ts         — 费用系统 E2E 测试
```

### 1. DSL Layer

位置：`src/core/dsl/types.ts`、`src/projects/expense/tasks.ts`

- `core/dsl` 提供通用类型（`TaskLog`、`WorkflowResult`）
- 每个 adapter 定义自己的 task schema（zod）
- zod schema 上使用 `.describe()` 为 LLM Planner 提供元数据

### 2. Capability Registry

位置：`src/core/planner/registry.ts`

从 zod schema 自动提取：
- task 名和描述
- 每个 arg 的名称、类型、是否必填、描述
- `project` 标识和 `riskLevel`

```ts
export function getCapabilities(
  workflowTaskSchema: ZodType,
  projectName: string
): Capability[]
```

### 3. Planner Layer

位置：`src/core/planner/planner.ts`

- 通用 `createPlanner(config, capabilities, schema)`
- prompt 动态构建自传入的 `capabilities`
- `response_format: { type: 'json_object' }` 约束输出
- 最多 3 轮 DSL 修正回路

### 4. Executor Layer

位置：`src/executor.ts`

当前还是费用系统特定的 Executor，从 core 导入通用类型。

### 5. Runtime / Page Task Layer

位置：`src/pages/expense-app.ts`（待迁移到 `src/projects/expense/pages/`）

当前采用混合策略：

```text
auth.login: UI 登录 + 捕获 JWT + 注入 Authorization header
project.create: UI 填写项目基本信息 + API commit
project.addMembers: UI 填写成员以验证可操作性 + API commit
expense.create: API commit 创建费用 + 跳转费用明细页断言
```

### 6. Playwright Layer

位置：`playwright.config.ts`、`tests/`

配置要点：
- 使用系统 Chrome：`channel: 'chrome'`
- `trace: 'retain-on-failure'`
- `screenshot: 'only-on-failure'`
- `video: 'retain-on-failure'`

## 当前关键决策

### LLM 不直接控制浏览器

LLM 只生成结构化 DSL。浏览器执行由 Task Executor 和 Runtime 完成。

LLM 的允许运行时职责：
- 将自然语言转换成已注册 capability 的 DSL
- 当 DSL schema 校验失败时，根据错误信息修正 DSL
- 当确定性执行失败且 Runtime 无法恢复时，给出修复建议
- 对需要语义判断的结果做辅助判断

LLM 不应：
- 直接输出任意 Playwright 脚本并执行
- 每一步都读取完整 DOM 后决定下一次点击
- 接管 Runtime 的 retry、wait、auth recovery 等确定性职责

### 允许 API/UI 混合执行

当前页面存在 AMIS 组件状态同步问题。项目创建和费用创建暂时允许 API commit。

这不是最终目标：
```text
先证明 DSL → Executor → 业务结果可闭环
再逐步把 API commit 替换为稳定 UI Action
```

### 新项目接入（3 个文件）

每个新项目最少需要：

1. **`tasks.ts`** — zod schema 定义
2. **`capabilities.ts`** — Capability 列表注册
3. **`pages/<project>-app.ts`** — Runtime 实现

接入流程：
```text
1. Playwright codegen 录制核心流程
2. 创建 src/projects/<name>/ 目录
3. 写 tasks.ts 定义 task schema
4. 写 capabilities.ts 注册 capability
5. 写 pages/<name>-app.ts 实现 Runtime
6. 注册到 CapabilityRegistry
7. 写 E2E 测试
8. 跑通后补充恢复策略
```

## Capability 类型

```ts
type Capability = {
  project: string;
  task: string;
  description: string;
  args: ArgMeta[];
  riskLevel: 'read' | 'write' | 'destructive';
};
```

`riskLevel` 仅在 Planner prompt 中提示（标记 `[高风险]`），不阻止执行。

## 迭代路线

```text
v0: 单项目单流程跑通        ✅
v1: 单项目多 task 能力化     ✅
v2: 抽出 core runtime        ✅
v3: 多项目 adapter           🔄（费用系统已迁移，待验证新项目接入）
v4: LLM Planner + DSL Validator  ✅
v5: LLM Recovery + Locator Repair
v6: 平台化报告、权限、数据治理
```

当前处于 **v3 早期**。

## 扩展原则

- LLM 面向 capability，不面向 DOM
- 每个项目只实现 adapter，不重复实现通用 Runtime
- 所有 DSL 必须 schema 校验后才能执行
- 高风险 task 必须有 riskLevel 标记
- 失败恢复按 Runtime retry → Auth recovery → Locator fallback → LLM recovery 分层
