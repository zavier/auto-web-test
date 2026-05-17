# 项目设计方案

## 目标

验证一种“AI 规划 + 确定性执行”的 Web 自动化测试工作流。

核心原则：

```text
LLM 负责理解用户意图并生成 DSL
Executor 负责解释 DSL
Runtime 负责稳定执行、等待、重试、认证、截图和结果判断
Playwright 负责页面/API 操作
```

避免让 LLM 在运行时直接一步步控制浏览器。

## 标准流程

项目约定的建设和运行流程：

```text
1. 先使用 Playwright codegen 录制核心业务流程
2. 将录制脚本工程化为可复用的 Task / Action / Locator / DSL
3. 实际用户输入自然语言时，LLM Planner 只负责生成结构化 DSL
4. WorkflowExecutor / Runtime 负责执行 DSL
5. LLM 只在有限场景介入：异常恢复、语义判断、locator 修复、业务分支澄清
```

第 4 步是架构边界：执行处理不由 LLM 直接完成，而由确定性的 Executor 和 Playwright Runtime 完成。

## 分层设计

### 1. DSL Layer

位置：`src/dsl.ts`

DSL 表达业务任务，而不是页面点击细节。

当前支持：

```text
auth.login
project.create
project.addMembers
expense.create
```

示例：

```json
[
  {
    "task": "project.create",
    "args": {
      "name": "测试自动化项目 1779021649",
      "description": "这是测试自动化的项目"
    }
  },
  {
    "task": "expense.create",
    "args": {
      "payer": "自动化1号",
      "participants": ["自动化1号", "自动化2号", "自动化3号"],
      "amount": 50,
      "category": "饮食",
      "remark": "111"
    }
  }
]
```

后续应补充 schema validator，例如 `zod` 或 JSON Schema，保证 LLM 输出不能越权执行。

### 2. Executor Layer

位置：`src/executor.ts`

职责：

- 顺序执行 DSL task。
- 将 task 路由到页面业务能力。
- 对未知 task 做编译期 `never` 穷尽检查。

当前还是线性执行，后续可扩展：

- 条件分支。
- retry policy。
- task 输出传递。
- 执行报告。

### 3. Runtime / Page Task Layer

位置：`src/pages/expense-app.ts`

职责：

- 登录、创建项目、添加成员、创建费用这些业务能力封装。
- 处理认证 token。
- 根据页面真实行为选择 UI 或 API 执行策略。
- 做页面断言。

当前采用混合策略：

```text
auth.login: UI 登录 + 捕获 JWT + 注入 Authorization header
project.create: UI 填写项目基本信息
project.addMembers: UI 填写成员以验证可操作性 + API commit 创建项目
expense.create: API commit 创建费用 + 跳转费用明细页断言
```

### 4. Playwright Layer

位置：`playwright.config.ts`、`tests/expense-workflow.spec.ts`

配置要点：

- 使用系统 Chrome：`channel: 'chrome'`。
- `trace: 'retain-on-failure'`。
- `screenshot: 'only-on-failure'`。
- `video: 'retain-on-failure'`。

测试入口只负责构造 DSL 和调用 Executor。

## 当前关键决策

### LLM 不直接控制浏览器

LLM 只应生成结构化 DSL。浏览器执行由 Task Executor 和 Runtime 完成。

原因：

- 降低 token 消耗。
- 避免无限 Agent 循环。
- 让失败可复现、可回放、可定位。

LLM 的允许运行时职责应限制在：

- 将自然语言转换成已注册 capability 的 DSL。
- 当 DSL schema 校验失败时，根据错误信息修正 DSL。
- 当确定性执行失败且 Runtime 无法恢复时，基于局部 DOM、截图、错误片段给出修复建议。
- 对确实需要语义判断的结果做辅助判断。

LLM 不应：

- 直接输出任意 Playwright 脚本并执行。
- 每一步都读取完整 DOM 后决定下一次点击。
- 接管 Runtime 的 retry、wait、auth recovery、dialog close 等确定性职责。

### 允许 API/UI 混合执行

当前页面存在 AMIS 组件状态同步问题。为了验证主链路，项目创建和费用创建暂时允许 API commit。

这不是最终目标，而是 v0 验证策略：

```text
先证明 DSL → Executor → 业务结果可闭环
再逐步把 API commit 替换为稳定 UI Action
```

### 任务输出比页面可见性更可靠

新建项目不一定出现在第一页，所以不应断言“项目名在当前页可见”。当前以接口查询得到 `projectId` 作为后续任务上下文。

后续应把 task output 明确建模，例如：

```ts
type ProjectCreateOutput = {
  projectId: number;
  projectName: string;
};
```

## 后续目标架构

```text
Natural Language
→ LLM Planner
→ Typed DSL
→ DSL Validator
→ Workflow Engine
→ Task Executor
→ Page Object / Action Library
→ Locator Registry
→ Playwright Runtime
→ Report / Trace / Recovery
```

需要逐步补齐：

- Capability Registry。
- DSL schema 校验。
- Action Layer。
- Locator Layer。
- Runtime retry/recovery。
- LLM planner 接入。

## 多项目扩展设计

短期目标仍然是先把费用管理系统跑扎实。后续扩展到其他项目或场景时，不应复制一套孤立脚本，而应拆成平台核心能力和业务项目适配层。

推荐结构：

```text
src/
  core/
    dsl/
    executor/
    runtime/
    actions/
    registry/
    planner/
    reporter/

  projects/
    expense/
      capabilities.ts
      tasks.ts
      pages/
      locators.ts
      fixtures.ts

    crm/
      capabilities.ts
      tasks.ts
      pages/
      locators.ts
      fixtures.ts
```

### Core Runtime

Core 负责跨项目通用能力：

- DSL schema 校验。
- WorkflowExecutor。
- Runtime wait、retry、timeout、trace、screenshot。
- Action Library。
- Locator Registry。
- Auth Manager。
- Capability Registry。
- LLM Planner。
- Report / Recovery。

### Project Adapter

每个业务系统只实现自己的适配层：

- 业务 capability 定义。
- task schema。
- task 到页面/API 的实现。
- 页面对象和 locator。
- 测试 fixture。
- 项目专属 prompt 示例。

示例：

```ts
await expense.expense.create({
  payer: '自动化1号',
  participants: ['自动化1号', '自动化2号', '自动化3号'],
  amount: 50,
  category: '饮食'
});

await crm.customer.create({
  name: '张三',
  phone: '13800000000',
  source: '官网'
});
```

### Capability Registry

多项目扩展的核心是 Capability Registry。LLM Planner 只能基于 registry 中已注册的能力生成 DSL。

建议结构：

```ts
type Capability = {
  project: string;
  task: string;
  description: string;
  argsSchema: unknown;
  examples: string[];
  riskLevel: 'read' | 'write' | 'destructive';
};
```

示例：

```json
{
  "project": "expense",
  "task": "expense.create",
  "description": "在费用管理系统中创建一笔费用记录",
  "riskLevel": "write",
  "argsSchema": {
    "payer": "string",
    "participants": "string[]",
    "amount": "number",
    "category": "string",
    "remark": "string?"
  }
}
```

### 新项目接入流程

新增一个业务系统时，按这个流程接入：

```text
1. Playwright codegen 录制核心流程
2. 提炼业务 capability
3. 定义 DSL task schema
4. 实现 project adapter
5. 注册 capability registry
6. 接入 LLM Planner 示例
7. 跑 E2E 验证并补充恢复策略
```

### 迭代路线

```text
v0: 单项目单流程跑通
v1: 单项目多 task 能力化
v2: 抽出 core runtime
v3: 多项目 adapter
v4: LLM Planner + DSL Validator
v5: LLM Recovery + Locator Repair
v6: 平台化报告、权限、数据治理
```

当前项目处于：

```text
v0 → v1
```

下一步仍应优先补齐费用系统 capability，例如：

```text
auth.login
project.create
project.addMembers
expense.create
expense.list
expense.assertSplit
```

等费用系统 task 稳定后，再抽象 core，避免过早抽象。

### 扩展原则

- LLM 面向 capability，不面向 DOM。
- 每个项目只实现 adapter，不重复实现通用 Runtime。
- 所有 DSL 必须 schema 校验后才能执行。
- 删除、审批、支付、提交等高风险 task 必须有风险等级和执行策略。
- 失败恢复按 Runtime retry、Auth recovery、Locator fallback、LLM recovery 分层，LLM 是最后一层。
