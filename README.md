# AI 加持的 Web 自动化测试工作流验证

这个项目用于验证一套面向 Web 页面操作的自动化测试工作流：

```text
用户自然语言
→ LLM 生成结构化 DSL
→ Task Executor 执行确定性任务
→ Playwright Runtime 操作页面/API
→ 结果断言与报告
```

当前验证对象是费用管理系统：创建项目、添加成员、记录费用，并检查费用明细结果。

## 当前状态

第一版最小闭环已经跑通：

```text
DSL
→ Executor
→ 登录 UI + 捕获 token
→ 创建项目 UI 填写 + API commit
→ 新增费用 API commit
→ 跳转费用明细页做页面断言
```

已验证命令：

```bash
npx tsc --noEmit
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

最后一次结果：

```text
1 passed
```

## 快速开始

安装依赖：

```bash
npm install
```

类型检查：

```bash
npx tsc --noEmit
```

运行费用系统工作流验证：

```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

本机使用系统 Chrome 运行，Playwright 配置里已经设置：

```ts
channel: 'chrome'
```

如果在 Codex 沙箱内运行，启动系统 Chrome 可能需要授权在沙箱外执行 `npx playwright test`。

## 目录结构

```text
src/dsl.ts                  DSL 类型与样例 workflow
src/executor.ts             Task Executor
src/pages/expense-app.ts    费用系统页面任务与 Runtime 逻辑
tests/expense-workflow.spec.ts
docs/design.md              架构设计与关键决策
docs/progress.md            当前进度和验证发现
docs/todo.md                后续任务清单
```

## 重要说明

当前版本是验证骨架，不是最终工程形态。它故意保留了一些从真实页面发现的妥协：

- 登录接口返回 JWT，但页面没有自动持久化 token，所以 Runtime 会捕获登录响应并注入 `Authorization` header。
- 创建项目的成员输入控件是 AMIS `input-array`，UI value 和提交 payload 存在同步问题，所以当前用 API 完成项目创建。
- 新增费用 UI 下拉选择尚未固化为稳定 Action，当前用 API 完成费用提交，再回到页面验证结果。

下一阶段重点是把这些 API 降级点逐步替换成稳定的 UI Action。
