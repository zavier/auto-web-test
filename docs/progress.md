# 当前进度

更新时间：2026-05-17

## 已完成

- 初始化 Playwright + TypeScript 项目。
- 将录制脚本提炼为业务 DSL。
- 实现第一版 `WorkflowExecutor`。
- 实现费用系统 `ExpenseApp` Runtime。
- 跑通第一条最小闭环测试。

已通过命令：

```bash
npx tsc --noEmit
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

最后一次 Playwright 结果：

```text
1 passed
```

## 当前验证流程

测试入口：`tests/expense-workflow.spec.ts`

当前 workflow：

```text
auth.login(admin/admin)
project.create(测试自动化项目 + timestamp)
project.addMembers(自动化1号, 自动化2号, 自动化3号)
expense.create(自动化1号 支付 50 元饮食费用, 三人分摊, 备注 111)
```

## 已发现事实

### 1. 系统 Chrome 可用

本机有 `/Applications/Google Chrome.app`。Playwright 不需要下载内置 Chromium，可以通过 `channel: 'chrome'` 使用系统 Chrome。

### 2. 登录接口返回 JWT，但前端没有写入 storage

登录接口：

```text
POST /expense/user/login
```

返回：

```json
{
  "status": 0,
  "data": "<jwt>"
}
```

但登录后：

```text
localStorage = {}
sessionStorage = {}
```

所以 Runtime 当前捕获登录响应，并设置：

```text
Authorization: <jwt>
```

### 3. 后续接口使用裸 Authorization header

后续 API 请求使用：

```text
Authorization: <jwt>
```

不是：

```text
Authorization: Bearer <jwt>
```

### 4. 创建项目的成员控件是 AMIS input-array

页面 schema 中成员字段：

```json
{
  "name": "members",
  "type": "input-array",
  "items": {
    "type": "input-text"
  }
}
```

实际输入框 name 是：

```text
input[name="flat"]
```

发现的问题：

- DOM value 可以正确显示成员名称。
- 但提交 payload 可能变成 `["", "自动化2号", ""]` 或最后一项为空。
- 因此当前创建项目用 API commit。

### 5. 创建项目后不一定出现在第一页

不能用“当前列表页可见项目名”作为创建成功断言。

当前做法：

```text
POST /expense/project/create
GET /expense/project/list?page=1&size=1000
按 projectName 找 projectId
```

### 6. 新增费用 date 字段需要秒级时间戳

错误用法：

```json
{
  "date": "2026-05-17"
}
```

会返回系统错误。

错误用法：

```json
{
  "date": 1779021599544
}
```

会被后端解释成异常日期。

正确用法：

```json
{
  "date": 1779021649
}
```

也就是：

```ts
Math.floor(Date.now() / 1000)
```

## 当前实现限制

- 还没有真正接入 LLM Planner。
- DSL 还没有运行时 schema 校验。
- `project.addMembers` 目前不是完整 UI 提交，而是 UI 填写 + API commit。
- `expense.create` 目前不是完整 UI 提交，而是 API commit + 页面结果验证。
- `selectFirstVisibleOption` 目前未被主流程使用，后续需要重新设计为稳定 Select Action。
- 没有清理测试数据，项目和费用会留在测试环境中。
