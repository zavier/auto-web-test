# 后续任务清单

## P0：把当前验证骨架稳定住

- [x] 给 DSL 增加运行时校验，建议使用 `zod` 或 JSON Schema。
- [x] 给 `WorkflowExecutor` 增加结构化执行日志：task 开始、task 成功、task 失败、耗时、关键输出。
- [ ] 明确 task output，例如 `project.create` 输出 `projectId`，`expense.create` 输出 `recordId` 或明细 URL。
  - [x] `project.create` → `projectId` + `projectName`
  - [ ] `expense.create` → `recordId`（当前 `createExpense()` 返回 `void`）
- [x] 把账号密码移到环境变量，例如 `EXPENSE_USERNAME`、`EXPENSE_PASSWORD`。
- [x] 增加 `.env.example` 或配置说明，避免把真实凭据写死在 DSL 样例里。

## P1：固化 UI Action Layer

- [ ] 实现稳定的 AMIS Select Action。
  - [ ] 支付人单选。
  - [ ] 使用人多选。
  - [ ] 费用类型选择。
  - [ ] 处理 overlay 拦截。
  - [ ] 处理已选值和候选项同名导致的 strict mode violation。
- [ ] 专项修复 AMIS `input-array`。
  - [ ] 明确触发表单 data 同步的事件序列。
  - [ ] 尽量用 UI submit 替换当前项目 API commit。
- [x] 为常见组件建立 Action API：
  - [x] `fillText(name, value)`
  - [x] `selectSingle(label, value)`
  - [x] `selectMultiple(label, values)`
  - [x] `fillInputArray(label, values)`
  - [x] `submitDialog(title)`
- [ ] 将 `createExpense` 从 API 提交切换为使用上述 Action API（当前仍走 `createExpenseByApi`）。

## P1：补齐 Locator Layer

- [ ] 建立 locator registry，避免散落 `getByText`、`.last()`、`.first()`。
- [ ] 优先使用：
  - role/name
  - input name
  - 表格行过滤
  - AMIS schema 信息
- [ ] 清理脆弱定位器（当前 `expense-app.ts` 中有 8 处 `.first()` / `.last()` 调用）。
- 已避免使用：
  - `nth()` 硬编码。
  - `tr:nth-child(...)`。
  - 全局 `getByText('请选择')`。

## P2：接入 LLM Planner

- [x] 定义 Capability Registry，让 LLM 只能选择已注册 task。
- [x] 增加自然语言到 DSL 的离线转换脚本（CLI 入口已实现）。
- [x] 明确 Planner 只输出 DSL，不直接输出 Playwright 操作。
- [x] 增加 planner prompt 中的职责边界说明：LLM 负责规划和有限恢复，Executor / Runtime 负责执行。
- [x] 增加 DSL 修正回路：
  - LLM 输出。
  - Schema 校验失败。
  - 返回校验错误。
  - LLM 修正 JSON。
- [x] 不允许 LLM 直接输出 Playwright 操作。

## P2：增强 Runtime

- [ ] 增加登录态恢复策略。
- [ ] 增加 API 响应格式兼容处理。
  - 当前接口有 `{status, msg}` 和 `{success, errMessage}` 两种格式。
- [ ] 增加失败截图、trace 路径、关键请求 payload 的报告汇总（Playwright 已配置 `trace: 'retain-on-failure'`，但缺少自定义聚合逻辑）。
- [ ] 对每个 task 设置超时和 retry 策略。
- [ ] 增加测试数据清理策略。

## P3：测试覆盖

- [ ] 单元测试 DSL validator。
- [ ] 单元测试 Executor task 路由。
- [ ] 为 Runtime 增加 mock API 测试。
- [ ] 增加端到端场景（目前仅 1 个 E2E 测试）：
  - [ ] 创建项目 + 添加成员。
  - [ ] 新增费用。
  - [ ] 查看费用明细。
  - [ ] 查看分摊明细。
  - [ ] 多笔费用后校验分摊结果。

## P3：工程化

- [x] 初始化 git 仓库或接入现有仓库。
- [ ] 增加 CI 命令（无 `.github/workflows/` 等 CI 配置）。
- [ ] 增加 Playwright HTML report 查看说明（当前 `playwright.config.ts` 未配置 `reporter: 'html'`）。
- [ ] 增加测试环境隔离和数据命名规范。

## P4：多项目扩展

- [x] 等费用系统 task 稳定后，将通用能力抽到 `src/core/`。
- [x] 将费用系统迁移为第一个 project adapter：`src/projects/expense/`。
- [x] 设计 `Capability` 类型和 Capability Registry。
- [ ] 为新项目定义接入模板：
  - `capabilities.ts`
  - `tasks.ts`
  - `pages/`
  - `locators.ts`
  - `fixtures.ts`
- [x] 增加跨项目测试目录结构：
  - `tests/expense/`
  - `tests/<project>/`
  - `tests/planner/`
- [x] 为 capability 增加 `riskLevel`，区分 `read`、`write`、`destructive`。
- [ ] 建立新项目接入流程文档：录制、提炼 capability、定义 DSL、实现 adapter、注册 registry、验证 E2E。
