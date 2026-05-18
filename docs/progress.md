# 当前进度

更新时间：2026-05-18

## 已完成

- [x] 初始化 Playwright + TypeScript 项目
- [x] 将录制脚本提炼为业务 DSL
- [x] 实现 `WorkflowExecutor`（结构化日志、task 输出传递）
- [x] 实现费用系统 `ExpenseApp` Runtime
- [x] DSL 运行时 schema 校验（zod）
- [x] 环境变量管理（`.env.example` + `dotenv`）
- [x] LLM Planner 接入（OpenAI + Capability Registry + CLI）
- [x] Capability Registry（从 zod schema 自动提取 capability）
- [x] Core 层抽取（`src/core/`：DSL 类型、Planner、Capability Registry）
- [x] 费用系统迁移为第一个 Project Adapter（`src/projects/expense/`）
- [x] 跨项目测试目录结构（`tests/planner/`、`tests/expense/`）
- [x] `riskLevel` 支持（`read`/`write`/`destructive`）
- [x] 跑通第一条最小闭环测试

## 当前架构

```text
src/
  core/                      ← 通用层
    dsl/types.ts             — TaskLog, WorkflowResult, TaskOutput
    planner/
      types.ts               — Capability, ProjectAdapter, ArgMeta
      registry.ts            — 从 zod schema 提取 capability
      planner.ts             — OpenAI 调用 + prompt + 修正回路
      cli.ts                 — 通用 CLI stub
    capability-registry.ts   — 聚合所有 adapter

  projects/
    expense/                 ← 第一个 adapter
      tasks.ts               — zod schema
      capabilities.ts        — capability 注册
      pages/                 — Runtime（待迁移）

  dsl.ts                     — 兼容层（re-export core + 费用 schema）
  executor.ts                — 兼容层（费用系统 Executor）
  planner/
    cli.ts                   — 费用系统特定 CLI
    registry.ts              — 旧 registry（待清理）
    planner.ts               — 旧 planner（待清理）
```

## 当前验证流程

测试入口：

```bash
# E2E
npx playwright test tests/expense/workflow.spec.ts --project=chromium

# Planner
npx tsx tests/planner/registry.test.ts
npx tsx tests/planner/planner.test.ts

# 类型检查
npx tsc --noEmit
```

当前 workflow（DSL 示例）：

```text
auth.login(admin/admin)
project.create(测试自动化项目 + timestamp)
project.addMembers(自动化1号, 自动化2号, 自动化3号)
expense.create(自动化1号 支付 50 元饮食费用, 三人分摊, 备注 111)
```

Planner 使用（CLI）：

```bash
OPENAI_API_KEY=sk-xxx npx tsx src/planner/cli.ts "创建一个叫团建的项目"
```

## 迭代阶段

```text
v0: 单项目单流程跑通        ✅
v1: 单项目多 task 能力化     ✅
v2: 抽出 core runtime        ✅
v3: 多项目 adapter           🔄（费用系统已迁移，待验证新项目接入）
v4: LLM Planner + DSL Validator  ✅
v5: LLM Recovery + Locator Repair
v6: 平台化报告、权限、数据治理
```

当前处于 **v3 早期**：Core 和第一个 Adapter 已建立，需要验证新项目能否顺利接入。

## 已知事实（保持有效）

1. 系统 Chrome 可用（`channel: 'chrome'`）
2. 登录接口返回 JWT，前端不写入 storage，Runtime 需手动注入 `Authorization: <jwt>`
3. 后续接口使用裸 JWT（非 Bearer）
4. 创建项目的成员控件是 AMIS input-array，有 sync bug，当前用 API commit
5. 创建项目后不一定出现在第一页，用 API 查询获取 projectId
6. 费用 date 字段需要秒级时间戳 `Math.floor(Date.now() / 1000)`
7. 测试数据不清理，项目/费用留在测试环境
