# P2: LLM Planner 接入设计方案

## 目标

让用户用自然语言描述操作意图，由 LLM 生成结构化 DSL，经 zod 校验后交由 Executor 执行。LLM 不直接控制浏览器 — 它只输出 DSL JSON。

支持两种使用方式：
- **离线**：CLI 脚本，人工审核后提交到测试代码
- **在线**：测试代码直接调用 `plan()`，运行时生成 DSL

## 架构

```
Natural Language
  → Planner (prompt 构建 + OpenAI 调用)
  → DSL JSON
  → Zod Validator (已有)
  → WorkflowExecutor (已有)
```

新增文件：

```
src/planner/
  registry.ts   — 从 zod schema 提取 Capability 列表
  planner.ts    — Planner 核心：prompt 构建、OpenAI 调用、修正回路
  cli.ts        — CLI 入口
```

## Capability Registry

### 设计决策

**代码即注册** — 不新建独立的 capabilities 文件。在现有 zod schema 上使用 `.describe()` 补充描述，`registry.ts` 从 `WorkflowTaskSchema` 的 union 成员中自动提取 Capability。

### Capability 类型

```ts
type Capability = {
  task: string;            // e.g. "expense.create"
  description: string;     // 从 z.literal().describe() 提取
  args: {                  // 从 z.object() 提取
    name: string;
    type: string;          // "string" | "number" | "string[]" | ...
    required: boolean;
    description?: string;
  }[];
};
```

### 数据来源

在 `src/dsl.ts` 的每个 task schema 上添加 `.describe()`：

```ts
const ExpenseCreateTask = z.object({
  task: z.literal('expense.create')
    .describe('在费用管理系统中创建一笔费用'),
  args: z.object({
    payer: z.string().min(1).describe('支付人姓名'),
    participants: z.array(z.string().min(1)).min(1).describe('参与分摊的人员'),
    amount: z.number().positive().describe('费用金额（元）'),
    category: z.string().min(1).describe('费用类别，如：饮食、交通、住宿'),
    remark: z.string().optional().describe('备注'),
  }),
});
```

`registry.ts` 导出：

```ts
export function getCapabilities(): Capability[];
```

遍历 `WorkflowTaskSchema` 的 union，对每个成员解析 literal 值和 object shape，输出 Capability 列表。

## Planner 核心

### 对外接口

```ts
export function createPlanner(config: {
  openaiApiKey: string;
  model?: string;  // 默认 'gpt-4o'
}): Planner;

interface Planner {
  plan(naturalLanguage: string): Promise<Workflow>;
}
```

### OpenAI 调用

- 使用 OpenAI SDK，`response_format: { type: 'json_object' }` 约束输出
- 单次 API 调用，无 streaming
- 超时 30 秒

### DSL 修正回路

最多 3 轮：

1. 调 OpenAI → `WorkflowSchema.safeParse()` → 通过则返回
2. 失败：将 `parseResult.error.message` 拼入新 user message → 重试
3. 3 轮后仍失败，抛出 `PlannerError`（包含全部修正历史）

```ts
class PlannerError extends Error {
  history: { input: string; output: string; error: string }[];
}
```

### Prompt 结构

**System message：**

```
你是 DSL Planner。你的唯一职责是把用户意图转换为 DSL JSON。

## 可用任务

{每个 capability: task 名、描述、args 说明}

## 规则

1. 只输出 DSL JSON 数组，不要输出额外文字
2. 只能使用上面列出的 task，不能编造
3. 理解用户意图后，按合理顺序排列 task（如先登录、再创建项目、再创建费用）
4. 不要输出 Playwright 代码或任何操作浏览器的指令
```

**修正轮 user message（在原始输入后追加）：**

```
上一次输出被校验拒绝，错误信息：

{parseError}

请修正你的输出，确保：
- task 名是可用任务列表中的其一
- 所有必填字段都已提供
- 字段类型正确
```

### 环境变量

- `OPENAI_API_KEY` — 必需
- `OPENAI_MODEL` — 可选，默认 `gpt-4o`

## CLI

入口：`src/planner/cli.ts`

```bash
npx tsx src/planner/cli.ts "创建一个叫团建的项目，添加自动化1号和2号"
npx tsx src/planner/cli.ts --model gpt-4o-mini "创建一笔饮食费用50元"
```

行为：
- 从 `OPENAI_API_KEY` 读取 key，未设置则输出错误到 stderr，退出码 1
- 调 `plan()` → 成功打印 JSON 到 stdout，退出码 0
- 失败打印错误到 stderr，退出码 1

## 错误处理

| 场景 | 处理 |
|------|------|
| `OPENAI_API_KEY` 未设置 | 立即抛错，不在源码中写死 |
| OpenAI API 调用失败 | 不重试网络错误，直接抛 `PlannerError` |
| Schema 校验失败 | 进入修正回路，最多 3 轮 |
| 3 轮修正后仍失败 | 抛 `PlannerError`，含全部修正历史 |
| 空输入 | 返回空 `Workflow`（`[]`） |

## 不在此范围

- **不**实现 LLM provider 抽象层 — 当前仅 OpenAI，YAGNI
- **不**实现在线执行中的异常恢复 — 那是 P2 "增强 Runtime" 的范畴
- **不**实现 Capability 的动态注册 — 仅从 zod schema 静态提取
- **不**允许 LLM 输出 Playwright 代码 — 这是硬约束，prompt 和 schema 双层保障

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/dsl.ts` | 修改 | 每个 task schema 加 `.describe()` |
| `src/planner/registry.ts` | 新增 | Capability 提取逻辑 |
| `src/planner/planner.ts` | 新增 | Planner 核心 |
| `src/planner/cli.ts` | 新增 | CLI 入口 |
| `package.json` | 修改 | 添加 `openai` 依赖 |
