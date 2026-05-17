# P1 Action Layer 设计文档

## 背景与目标

P0 完成后，DSL → Executor → Runtime 的执行链路已稳定。但 `expense.create` 仍使用 API commit，因为 AMIS Select 组件（支付人单选、使用人多选、费用类型选择）的交互不够稳定。

P1 目标是固化 UI Action Layer，让 `expense.create` 实现完整 UI 提交，替换 API commit。

## 设计决策

| 决策 | 选择 |
|------|------|
| P1 推进顺序 | 先 Action 后 Locator |
| Action API scope | 费用系统内聚（ExpenseApp 私有方法） |
| input-array 修复 | 降低优先级，后续处理 |
| expense.create 模式 | 完整 UI 提交 |
| AMIS Select 策略 | 混合策略（单选用键盘搜索，多选用 click） |

## Action API（ExpenseApp 私有方法）

五个方法全部在 `ExpenseApp` 内部：

```ts
private async fillText(name: string, value: string): Promise<void>
private async selectSingle(label: string, value: string): Promise<void>
private async selectMultiple(label: string, values: string[]): Promise<void>
private async fillInputArray(label: string, values: string[]): Promise<void>
private async submitDialog(title: string): Promise<void>
```

### fillText

封装 `input[name]` 填充：

```ts
private async fillText(name: string, value: string): Promise<void> {
  await this.page.locator(`input[name="${name}"]`).fill(value);
}
```

### selectSingle — 键盘搜索策略

支付人单选、费用类型选择：

1. 通过 label 文本定位 select trigger
2. 点击打开 dropdown
3. 等待 overlay 内搜索框可见
4. `pressSequentially(value)` 过滤候选项
5. `keyboard.press('Enter')` 确认
6. 等待 overlay 关闭
7. 验证选中值在 trigger 中可见

键盘搜索天然解决 strict mode 问题：搜索过滤后候选项唯一，不会选错。

搜索框不可用时（旧版 AMIS）回退到方向键导航。

### selectMultiple — Click 策略

使用人多选：

1. 通过 label 定位 trigger 并点击
2. 等待 dropdown overlay 出现
3. 逐个点击每个 value 对应的 option
4. 每次点击后验证 badge/tag 出现
5. Escape 关闭 dropdown
6. 验证所有 badge 可见

### fillInputArray — 保持现状

封装当前 `fillMembers` 的 UI 逻辑。行为不变，仍配套 `createProjectByApi` 兜底（input-array 未修复）。

### submitDialog

```ts
private async submitDialog(title = '提交'): Promise<void> {
  await this.page.getByRole('button', { name: title }).click();
}
```

## AMIS Select 交互模型

### 预期 DOM 结构

```
表单字段行
  <label>支付人</label>
  <div class="cxd-Select">
    <div class="cxd-Select-value">   ← trigger
    </div>
  </div>
  ↓ 点击后
  <div class="cxd-Overlay">
    <div class="cxd-Select-menu">
      <input class="cxd-Select-search">
      <div class="cxd-Select-option">自动化1号</div>
      ...
    </div>
  </div>
```

**注意：** 真实 DOM class 名称以 Playwright Inspector 实际观察为准，实现时先确认。

### 风险矩阵

| 风险 | 对策 |
|------|------|
| 搜索框不存在（旧版 AMIS） | `locator.count()` 检测，回退方向键导航 |
| Overlay 被遮挡 | 优先等待遮挡消失，`force: true` 仅作最后手段 |
| Select 不在滚动可见区 | 点击前 `scrollIntoViewIfNeeded()` |
| 同名 strict mode | 键盘搜索方案已规避 |
| 多选 option 点击后未立即渲染 badge | 每次点击后 `expect(badge).toBeVisible()` |

## expense.create 重写

### 变更

由 API commit + 页面断言 → 完整 UI 填写 + UI 提交 + 页面断言。

```ts
async createExpense(args: CreateExpenseArgs): Promise<void> {
  if (!this.latestProjectId || !this.latestProjectName) {
    throw new Error('Cannot create expense before project.create');
  }

  await this.page.goto(`/expense/index-cdn.html#/expense/${this.latestProjectId}/add`);

  await this.selectSingle('支付人', args.payer);
  await this.selectMultiple('使用人', args.participants);
  await this.fillText('amount', String(args.amount));
  await this.selectSingle('费用类型', args.category);
  if (args.remark) {
    await this.fillText('remark', args.remark);
  }

  await this.submitDialog('提交');

  await this.page.goto(`/expense/index-cdn.html#/expense/${this.latestProjectId}/list`);
  await expect(this.page.getByText(args.remark ?? String(args.amount))).toBeVisible();
}
```

### 删除

- `createExpenseByApi` 私有方法 — 被 UI 提交替代

### 保留

- `createProjectByApi` — input-array 未修复，仍需要 API 兜底
- `selectFirstVisibleOption` — P1 实现后删除，被 `selectSingle`/`selectMultiple` 替代

## 文件变更

| 文件 | 操作 | 变更 |
|------|------|------|
| `src/pages/expense-app.ts` | 重写 | 新增 5 个 Action 方法；重写 `createExpense`；删除 `createExpenseByApi` |
| `src/dsl.ts` | 不变 | |
| `src/executor.ts` | 不变 | |
| `tests/expense-workflow.spec.ts` | 不变 | |

## 测试策略

- 回归测试：`npx playwright test tests/expense-workflow.spec.ts --project=chromium` 必须通过
- `result.logs[2]`（expense.create）status 为 `success`
- 费用列表页出现目标 remark 文本

## 后续延后事项

| 事项 | 原因 |
|------|------|
| input-array UI submit | 需逆向 AMIS 数据同步机制 |
| Locator Registry | P1-B 独立推进 |
| `selectFirstVisibleOption` 清理 | P1 Action 完成后删除 |
