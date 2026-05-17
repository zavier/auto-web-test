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
