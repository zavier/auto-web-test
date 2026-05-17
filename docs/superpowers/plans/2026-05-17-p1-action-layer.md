# P1 Action Layer 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ExpenseApp 中新增 5 个 Action 私有方法，将 expense.create 从 API commit 转为完整 UI 提交。

**Architecture:** 所有 Action 方法作为 ExpenseApp 的私有方法内聚。selectSingle 用键盘搜索 + Enter，selectMultiple 用 click + badge 验证。createExpenseByApi 删除。

**Tech Stack:** TypeScript, Playwright, AMIS (目标页面框架)

---

## 文件结构映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/pages/expense-app.ts` | 修改 | 新增 5 个 Action 私有方法；重写 `createExpense`；删除 `createExpenseByApi` 和 `selectFirstVisibleOption` |

---

## Task 1: 确认 AMIS Select DOM 结构

**Files:**
- No code changes

- [ ] **Step 1: 打开 headed 浏览器，导航到费用新增页面**

先跑一遍完整 workflow 到达费用新增页，或手动登录后导航到 `#/expense/{projectId}/add`。

Run:
```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium --headed
```

在浏览器中手动操作到费用新增页面，或用 `--debug` 断点。

- [ ] **Step 2: 使用 Playwright Inspector 确认以下 DOM 结构**

打开 DevTools，确认：

1. **Select 触发区域**的 class 名称和结构（支付人、费用类型用同一个组件）
2. **多选 Select**（使用人）的触发区域 class
3. **点击后弹出的 overlay** 的 class 名称
4. **Overlay 内是否有搜索 input**，以及它的选择器
5. **Option 元素**的 class 名称和文本定位方式
6. **多选选中后的 badge/tag** 渲染位置和 class

记录实际 class 名称，与设计文档中假设的 `.cxd-*` 对比。

- [ ] **Step 3: 在 `selectFirstVisibleOption` 的已有逻辑基础上确认交互序列**

当前 `selectFirstVisibleOption` 方法（`expense-app.ts:161-165`）使用了 `getByText(triggerText).first().click()` → 等待 option → `getByText(optionText).last().click()` 的模式。确认这个模式在 Select 组件上的实际表现，以及为什么当前未启用。

Expected: 获得准确的 DOM class 名称和交互序列，为后续 Task 提供精确的 locator。

---

## Task 2: 添加 fillText 和 submitDialog

**Files:**
- Modify: `src/pages/expense-app.ts`

- [ ] **Step 1: 在 `fillMembers` 方法之后添加 `fillText`**

```ts
private async fillText(name: string, value: string): Promise<void> {
  await this.page.locator(`input[name="${name}"]`).fill(value);
}
```

- [ ] **Step 2: 在 `fillText` 之后添加 `submitDialog`**

```ts
private async submitDialog(title = '提交'): Promise<void> {
  await this.page.getByRole('button', { name: title }).click();
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): add fillText and submitDialog action helpers"
```

---

## Task 3: 实现 selectSingle

**Files:**
- Modify: `src/pages/expense-app.ts` — 在 `submitDialog` 后添加

- [ ] **Step 1: 添加 `selectSingle` 方法**

基于 Task 1 确认的 DOM 结构调整 locator。以下代码以 AMIS 常见 class 名为基础，实现时按实际调整：

```ts
private async selectSingle(label: string, value: string): Promise<void> {
  // 定位包含 label 文本的表单行，然后找到其中的 Select 触发区域
  const group = this.page.locator('.cxd-Form-group, .cxd-Form-item').filter({ hasText: label });
  const trigger = group.locator('.cxd-Select').first();

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  // 等待下拉 overlay 出现
  const overlay = this.page.locator('.cxd-Overlay').last();
  await expect(overlay).toBeVisible({ timeout: 5_000 });

  // 尝试键盘搜索
  const searchInput = overlay.locator('input').first();
  const hasSearch = (await searchInput.count()) > 0;

  if (hasSearch) {
    await searchInput.pressSequentially(value, { delay: 20 });
    await this.page.keyboard.press('Enter');
  } else {
    // 回退：直接点击 option
    await overlay.getByText(value, { exact: true }).first().click();
  }

  // 等待 overlay 关闭
  await expect(overlay).not.toBeVisible({ timeout: 5_000 });

  // 验证选中值在表单行中可见
  await expect(group.getByText(value, { exact: true })).toBeVisible({ timeout: 5_000 });
}
```

**注意：** `.cxd-Form-group`、`.cxd-Select`、`.cxd-Overlay` 需按 Task 1 确认的实际 class 调整。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): add selectSingle action with keyboard search strategy"
```

---

## Task 4: 实现 selectMultiple

**Files:**
- Modify: `src/pages/expense-app.ts` — 在 `selectSingle` 后添加

- [ ] **Step 1: 添加 `selectMultiple` 方法**

```ts
private async selectMultiple(label: string, values: string[]): Promise<void> {
  const group = this.page.locator('.cxd-Form-group, .cxd-Form-item').filter({ hasText: label });
  const trigger = group.locator('.cxd-Select').first();

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const overlay = this.page.locator('.cxd-Overlay').last();
  await expect(overlay).toBeVisible({ timeout: 5_000 });

  for (const value of values) {
    const option = overlay.getByText(value, { exact: true }).first();
    await option.click();
    // 每次点击后验证对应的 badge/tag 在表单行中可见
    await expect(group.getByText(value, { exact: true })).toBeVisible({ timeout: 5_000 });
  }

  // Escape 关闭 dropdown
  await this.page.keyboard.press('Escape');
  await expect(overlay).not.toBeVisible({ timeout: 5_000 });
}
```

**注意：** locator class 名称按 Task 1 实际结果调整。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): add selectMultiple action with click and badge verification"
```

---

## Task 5: 封装 fillInputArray

**Files:**
- Modify: `src/pages/expense-app.ts`

- [ ] **Step 1: 在 `selectMultiple` 后添加 `fillInputArray`，并让 `fillMembers` 委托给它**

`fillInputArray` 是当前 `fillMembers` 的公开封装。由于 input-array 未修复，行为不变。

```ts
private async fillInputArray(label: string, values: string[]): Promise<void> {
  await this.fillMembers(values);
}
```

然后更新 `createProject` 和 `addMembers` 中对 `this.fillMembers()` 的调用，改为 `this.fillInputArray(...)`。`fillMembers` 改为 `fillInputArray` 的委托。

实际上更简洁的做法是直接把 `fillMembers` 重命名为 `fillInputArray`，更新所有调用点。

- [ ] **Step 2: 重命名 `fillMembers` → `fillInputArray`，更新所有调用点**

在 `expense-app.ts` 中，`fillMembers` 在 3 处被调用：
- `createProject` 中：`await this.fillMembers(args.members);`
- `addMembers` 中：`await this.fillMembers(args.members);`
- 方法定义本身

将方法名从 `fillMembers` 改为 `fillInputArray`，签名加上 `label` 参数（当前不使用，预留）：

```ts
private async fillInputArray(_label: string, values: string[]): Promise<void> {
  for (const member of values) {
    await this.page.getByRole('button', { name: '新增', exact: true }).click();
    const input = this.page.locator('input[name="flat"]').last();
    await input.click();
    await input.pressSequentially(member, { delay: 20 });
    await this.page.keyboard.press('Tab');
  }
}
```

更新 `createProject` 中的调用：
```ts
// 原来：
await this.fillMembers(args.members);
// 改为：
await this.fillInputArray('成员', args.members);
```

更新 `addMembers` 中的调用：
```ts
// 原来：
await this.fillMembers(args.members);
// 改为：
await this.fillInputArray('成员', args.members);
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): rename fillMembers to fillInputArray action"
```

---

## Task 6: 重写 createExpense 为 UI 提交，删除 createExpenseByApi

**Files:**
- Modify: `src/pages/expense-app.ts`

- [ ] **Step 1: 替换 `createExpense` 方法体**

将当前 API commit 实现替换为 UI 填写 + UI 提交：

```ts
async createExpense(args: CreateExpenseArgs): Promise<void> {
  if (!this.latestProjectId || !this.latestProjectName) {
    throw new Error('Cannot create expense before project.create has produced a project id.');
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

  // 提交后跳转到列表页验证
  await this.page.goto(`/expense/index-cdn.html#/expense/${this.latestProjectId}/list`);
  await expect(this.page.getByText(args.remark ?? String(args.amount))).toBeVisible();
}
```

- [ ] **Step 2: 删除 `createExpenseByApi` 方法**

删除 `expense-app.ts` 中的整个 `private async createExpenseByApi(...)` 方法体（当前在 `fillInputArray` 和 `findProjectIdByName` 之间）。

- [ ] **Step 3: 删除 `selectFirstVisibleOption` 方法**

删除 `expense-app.ts` 中整个 `private async selectFirstVisibleOption(...)` 方法（当前在 `findProjectIdByName` 之后）。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/pages/expense-app.ts
git commit -m "feat(runtime): rewrite createExpense for full UI submission, remove API fallback"
```

---

## Task 7: 回归验证

**Files:**
- No code changes

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 2: 运行回归测试**

Run:
```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium
```

Expected: `1 passed`。

验证点：
- `result.success` 为 `true`
- `result.logs[2].task` 为 `expense.create`，`status` 为 `success`
- 费用列表页出现 remark 文本（页面断言通过）

- [ ] **Step 3: 如果测试失败，调试**

如果 Select Action 的 locator 不匹配实际 DOM，使用 `--headed` 或 `--debug` 模式定位问题：

```bash
npx playwright test tests/expense-workflow.spec.ts --project=chromium --headed
```

根据实际情况微调 `selectSingle` 和 `selectMultiple` 中的 locator class 名称。

修复后重复 Step 1-2 直到通过。

- [ ] **Step 4: Commit（如有修复）**

```bash
git add src/pages/expense-app.ts
git commit -m "fix(runtime): adjust AMIS select locators for actual DOM"
```

---

## Self-Review

**1. Spec coverage:**

| Spec 要求 | 对应任务 |
|-----------|---------|
| fillText | Task 2 |
| submitDialog | Task 2 |
| selectSingle（键盘搜索） | Task 3 |
| selectMultiple（click + badge） | Task 4 |
| fillInputArray | Task 5 |
| expense.create 重写为 UI | Task 6 |
| 删除 createExpenseByApi | Task 6 |
| 删除 selectFirstVisibleOption | Task 6 |
| 回归验证 | Task 7 |
| AMIS Select DOM 确认 | Task 1 |

无遗漏。

**2. Placeholder scan:**

- 无 "TBD"、"TODO"、"implement later"。
- 所有步骤包含完整代码。
- Task 1 标注了 class 名称需要确认，但提供了具体的确认清单和操作方法，不是空白占位符。

**3. Type consistency:**

- 所有 5 个 Action 方法签名与设计文档一致。
- `fillInputArray` 签名 `(_label: string, values: string[])` 与 `fillMembers` 重命名后一致。
- `createExpense` 返回类型保持 `Promise<void>`。
- Executor 的 `runTask` switch case 无需修改（`expense.create` 仍返回 `undefined`）。

---
