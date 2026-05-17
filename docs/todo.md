# 后续任务清单

## P0：把当前验证骨架稳定住

- 给 DSL 增加运行时校验，建议使用 `zod` 或 JSON Schema。
- 给 `WorkflowExecutor` 增加结构化执行日志：task 开始、task 成功、task 失败、耗时、关键输出。
- 明确 task output，例如 `project.create` 输出 `projectId`，`expense.create` 输出 `recordId` 或明细 URL。
- 把账号密码移到环境变量，例如 `EXPENSE_USERNAME`、`EXPENSE_PASSWORD`。
- 增加 `.env.example` 或配置说明，避免把真实凭据写死在 DSL 样例里。

## P1：固化 UI Action Layer

- 实现稳定的 AMIS Select Action。
  - 支付人单选。
  - 使用人多选。
  - 费用类型选择。
  - 处理 overlay 拦截。
  - 处理已选值和候选项同名导致的 strict mode violation。
- 专项修复 AMIS `input-array`。
  - 明确触发表单 data 同步的事件序列。
  - 尽量用 UI submit 替换当前项目 API commit。
- 为常见组件建立 Action API：
  - `fillText(name, value)`
  - `selectSingle(label, value)`
  - `selectMultiple(label, values)`
  - `fillInputArray(label, values)`
  - `submitDialog(title)`

## P1：补齐 Locator Layer

- 建立 locator registry，避免散落 `getByText`、`.last()`、`.first()`。
- 优先使用：
  - role/name
  - input name
  - 表格行过滤
  - AMIS schema 信息
- 避免使用：
  - `nth()` 硬编码。
  - `tr:nth-child(...)`。
  - 全局 `getByText('请选择')`。

## P2：接入 LLM Planner

- 定义 Capability Registry，让 LLM 只能选择已注册 task。
- 增加自然语言到 DSL 的离线转换脚本。
- 增加 DSL 修正回路：
  - LLM 输出。
  - Schema 校验失败。
  - 返回校验错误。
  - LLM 修正 JSON。
- 不允许 LLM 直接输出 Playwright 操作。

## P2：增强 Runtime

- 增加登录态恢复策略。
- 增加 API 响应格式兼容处理。
  - 当前接口有 `{status, msg}` 和 `{success, errMessage}` 两种格式。
- 增加失败截图、trace 路径、关键请求 payload 的报告汇总。
- 对每个 task 设置超时和 retry 策略。
- 增加测试数据清理策略。

## P3：测试覆盖

- 单元测试 DSL validator。
- 单元测试 Executor task 路由。
- 为 Runtime 增加 mock API 测试。
- 增加端到端场景：
  - 创建项目 + 添加成员。
  - 新增费用。
  - 查看费用明细。
  - 查看分摊明细。
  - 多笔费用后校验分摊结果。

## P3：工程化

- 初始化 git 仓库或接入现有仓库。
- 增加 CI 命令。
- 增加 Playwright HTML report 查看说明。
- 增加测试环境隔离和数据命名规范。
