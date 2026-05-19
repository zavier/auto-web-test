import { expect, type Page } from '@playwright/test';

export class ExpensePage {
  constructor(private readonly page: Page) {}

  async login(args: { username: string; password: string }): Promise<string> {
    await this.page.goto('/expense/index-cdn.html');
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await this.page.goto('/expense/index-cdn.html#/project/list');
    await this.page.getByRole('link', { name: '登录' }).click();
    const loginResponse = this.page.waitForResponse((response) =>
      response.url().includes('/expense/user/login')
    );
    await this.page.locator('input[name="username"]').fill(args.username);
    await this.page.locator('input[name="password"]').fill(args.password);
    await this.page.getByRole('button', { name: '提交' }).click();
    const token = ((await (await loginResponse).json()) as { data?: string }).data;

    if (!token) {
      throw new Error('Login succeeded visually but did not return an auth token.');
    }

    await this.page.setExtraHTTPHeaders({ Authorization: token });
    await this.page.goto('/expense/index-cdn.html#/project/list');
    await expect(this.page.getByRole('button', { name: '创建项目' })).toBeVisible();
    return token;
  }

  async openCreateProjectDialog(): Promise<void> {
    await this.page.getByRole('button', { name: '创建项目' }).click();
  }

  async fillProjectName(name: string): Promise<void> {
    await this.page.locator('input[name="projectName"]').fill(name);
  }

  async fillProjectDescription(description: string): Promise<void> {
    await this.page.locator('input[name="projectDesc"]').fill(description);
  }

  async getProjectDescription(): Promise<string> {
    return this.page.locator('input[name="projectDesc"]').inputValue();
  }

  async fillMembers(values: string[]): Promise<void> {
    for (const value of values) {
      await this.page.getByRole('button', { name: '新增', exact: true }).click();
      const input = this.page.locator('input[name="flat"]').last();
      await input.click();
      await input.pressSequentially(value, { delay: 20 });
      await this.page.keyboard.press('Tab');
    }
  }

  async clickCancel(): Promise<void> {
    await this.page.getByRole('button', { name: '取消' }).click();
    await this.page.waitForTimeout(500);
  }

  async navigateToProjectList(): Promise<void> {
    await this.page.goto('/expense/index-cdn.html#/project/list');
  }

  async openProjectEdit(projectName: string): Promise<void> {
    const projectRow = this.page.locator('tr').filter({ hasText: projectName });
    await expect(projectRow).toBeVisible();
    await projectRow.getByRole('button', { name: '编辑' }).click();
    await expect(this.page.getByRole('button', { name: '提交' })).toBeVisible();
  }

  async submitMembersForm(): Promise<void> {
    const submitResponse = this.page.waitForResponse((response) => {
      const url = response.url();
      return url.includes('/expense/project') && response.request().method() === 'POST';
    });
    await this.page.getByRole('button', { name: '提交' }).click();
    const response = await submitResponse;

    if (!response.ok()) {
      throw new Error(`addMembers submit failed with HTTP ${response.status()}`);
    }

    const body = (await response.json()) as { status?: number; msg?: string };
    if (body.status !== 0) {
      throw new Error(`addMembers API failed: ${body.msg ?? JSON.stringify(body)}`);
    }
  }

  async navigateToExpenseList(projectId: number): Promise<void> {
    await this.page.goto(`/expense/index-cdn.html#/expense/${projectId}/list`);
  }

  async assertExpenseVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }
}
