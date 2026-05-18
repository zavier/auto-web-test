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

## 标准工作流

这个项目采用的完整流程是：

```text
1. 使用 Playwright codegen 录制核心业务流程
2. 将录制脚本工程化为 Task / Action / Locator / DSL
3. 用户输入自然语言时，LLM Planner 生成结构化 DSL
4. WorkflowExecutor / Runtime 执行 DSL
5. LLM 只在异常恢复、语义判断、locator 修复等少数场景介入
```

注意第 4 步不是"LLM 负责执行处理"。执行浏览器和业务动作的是确定性的 Executor / Runtime。LLM 的主要职责是规划和有限辅助恢复，避免系统退回到不稳定的"AI 浏览器 Agent"模式。

## 架构

项目采用多项目可扩展架构，分四层：

```text
src/
├── core/                          # 通用跨项目层
│   ├── dsl/types.ts               # 通用类型：TaskLog, WorkflowResult, TaskOutput
│   ├── planner/types.ts           # Capability, ProjectAdapter, ArgMeta 类型
│   ├── planner/registry.ts        # 从 zod schema 内省提取 Capability[]
│   ├── planner/planner.ts         # 通用 LLM Planner（OpenAI + prompt + 修正回路）
│   ├── planner/cli.ts             # Planner CLI 入口（桩）
│   └── capability-registry.ts     # 聚合所有 project adapter
│
├── projects/                      # 项目适配器层
│   └── expense/                   # 费用管理系统（首个 adapter）
│       ├── tasks.ts               # Zod schema 定义（.describe() 即文档）
│       ├── capabilities.ts        # 注册 capabilities
│       └── index.ts               # 统一导出
│
├── dsl.ts                         # 兼容层：重新导出通用类型 + 费用系统 task schema
├── executor.ts                    # 兼容层：WorkflowExecutor
│
├── pages/expense-app.ts           # 遗留：费用系统 Runtime（待迁入 projects/expense/pages/）
└── planner/                       # 遗留：旧 planner（待清理）
    ├── registry.ts                # 已迁移到 core/planner/
    ├── planner.ts                 # 已迁移到 core/planner/
    └── cli.ts                     # 已迁移到 core/planner/（功能入口）
```

核心设计原则：
- **LLM 不直接控制浏览器**，只生成结构化 DSL，由 Executor/Runtime 确定性执行
- **Capability Registry 从 zod schema 自动内省**，`.describe()` 是唯一的元数据来源
- **每个业务系统只需实现 3 个文件**（tasks.ts, capabilities.ts, pages/）即可接入

## 当前状态

multi-project 架构 v3 已跑通：

```text
Core 层提取完成 → expense 适配器接入 → Planner 可用 → E2E 测试通过
```

已验证命令：

```bash
npx tsc --noEmit
npx playwright test tests/expense/workflow.spec.ts --project=chromium
npx tsx tests/planner/registry.test.ts
npx tsx tests/planner/planner.test.ts
```

LLM Planner 已实现，支持从自然语言生成 DSL：

```bash
npx tsx src/planner/cli.ts "创建一个项目叫团建费用，添加张三和李四，然后记录一笔聚餐费用 300 元"
```

Planner 特性：
- 从 zod schema 自动提取 capability 列表（无需手动注册）
- LLM 输出 → schema 校验 → 失败时反馈错误并修正（最多 3 轮）
- `riskLevel` 标记（read/write/destructive），高风险操作需用户明确声明
- 禁止 LLM 输出 Playwright 代码，确保执行层是确定性的

## 运行要求

环境变量：

| 变量 | 必需 | 说明 |
|------|------|------|
| `EXPENSE_USERNAME` | 是 | 费用系统登录用户名 |
| `EXPENSE_PASSWORD` | 是 | 费用系统登录密码 |
| `OPENAI_API_KEY` | Planner 用 | OpenAI API key |
| `OPENAI_MODEL` | 否 | 模型覆盖（默认 `gpt-4o`） |

## 快速开始

安装依赖：

```bash
npm install
```

类型检查：

```bash
npx tsc --noEmit
```

运行费用系统 E2E 测试：

```bash
npx playwright test tests/expense/workflow.spec.ts --project=chromium
```

运行 Planner 单元测试：

```bash
npx tsx tests/planner/registry.test.ts
npx tsx tests/planner/planner.test.ts
```

本机使用系统 Chrome 运行，Playwright 配置里已经设置 `channel: 'chrome'`。

## 重要说明

当前版本是验证骨架，不是最终工程形态。它故意保留了一些从真实页面发现的妥协：

- 登录接口返回 JWT，但页面没有自动持久化 token，所以 Runtime 会捕获登录响应并注入 `Authorization` header。
- 创建项目的成员输入控件是 AMIS `input-array`，UI value 和提交 payload 存在同步问题，所以当前用 API 完成项目创建提交。
- 新增费用 UI 下拉选择尚未固化为稳定 Action，当前用 API 完成费用提交，再回到页面验证结果。
- 测试数据不会自动清理，创建的项目和费用会残留在测试环境中。

下一阶段重点是把这些 API 降级点逐步替换成稳定的 UI Action。

## 扩展方向

短期先聚焦费用系统，把当前 task 做扎实。后续如果扩展到其他项目或业务系统，推荐演进为：

```text
core runtime
+ project adapters
+ capability registry
```

通用执行、校验、恢复、报告能力放到 core；每个业务系统只实现自己的 capability、task、page、locator 和 fixture。详细方案见 [docs/design.md](docs/design.md) 的"多项目扩展设计"。

## 待办

详见 [docs/todo.md](docs/todo.md)。当前主线：

1. **P1 UI Action Layer** — 稳定 AMIS Select 操作，修复 input-array 同步问题
2. **P1 Locator Layer** — 建立 locator registry，移除脆弱的 `.first()`/`.last()`
3. **P2 Runtime Enhancement** — 登录恢复、API 格式兼容、retry 策略、数据清理
4. **P3 测试覆盖** — 单元测试、mock API 测试、更多 E2E 场景
5. **P4 清理** — 移除 `src/planner/` 和 `src/pages/` 遗留文件
