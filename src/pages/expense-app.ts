import { expect, type Page } from '@playwright/test';

type LoginArgs = {
  username: string;
  password: string;
};

type CreateProjectArgs = {
  name: string;
  description?: string;
  members?: string[];
};

type AddMembersArgs = {
  members: string[];
};

type CreateExpenseArgs = {
  payer: string;
  participants: string[];
  amount: number;
  category: string;
  remark?: string;
};

export class ExpenseApp {
  private authToken?: string;
  private latestProjectId?: number;
  private latestProjectName?: string;

  constructor(private readonly page: Page) {}

  async login(args: LoginArgs): Promise<void> {
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

    this.authToken = token;
    await this.page.setExtraHTTPHeaders({ Authorization: token });
    await this.page.goto('/expense/index-cdn.html#/project/list');
    await expect(this.page.getByRole('button', { name: '创建项目' })).toBeVisible();
  }

  async createProject(args: CreateProjectArgs): Promise<{ projectId: number; projectName: string }> {
    this.latestProjectName = args.name;
    await this.page.getByRole('button', { name: '创建项目' }).click();
    await this.page.locator('input[name="projectName"]').fill(args.name);
    await this.page.locator('input[name="projectDesc"]').fill(args.description ?? '');

    if (args.members) {
      await this.fillMembers(args.members);
    }

    await this.createProjectByApi(args.members ?? []);
    await this.page.goto('/expense/index-cdn.html#/project/list');

    return { projectId: this.latestProjectId!, projectName: args.name };
  }

  async addMembers(args: AddMembersArgs): Promise<{ projectId: number }> {
    if (!this.latestProjectId) {
      throw new Error('Cannot add members before project.create has produced a project id.');
    }

    if (!this.latestProjectName) {
      throw new Error('Cannot add members before project.create has set a project name.');
    }

    await this.page.goto('/expense/index-cdn.html#/project/list');

    const projectRow = this.page.locator('tr').filter({ hasText: this.latestProjectName });
    await expect(projectRow).toBeVisible();
    await projectRow.getByRole('button', { name: '编辑' }).click();

    // Wait for edit form to be ready
    await expect(this.page.getByRole('button', { name: '提交' })).toBeVisible();

    await this.fillMembers(args.members);

    // Capture the submit response and verify success
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

    await this.page.goto('/expense/index-cdn.html#/project/list');

    return { projectId: this.latestProjectId };
  }

  async createExpense(args: CreateExpenseArgs): Promise<void> {
    await this.createExpenseByApi(args);
    await this.page.goto(`/expense/index-cdn.html#/expense/${this.latestProjectId}/list`);
    await expect(this.page.getByText(args.remark ?? String(args.amount))).toBeVisible();
  }

  private async fillMembers(members: string[]): Promise<void> {
    for (const member of members) {
      await this.page.getByRole('button', { name: '新增', exact: true }).click();
      const input = this.page.locator('input[name="flat"]').last();
      await input.click();
      await input.pressSequentially(member, { delay: 20 });
      await this.page.keyboard.press('Tab');
    }
  }

  private async fillText(name: string, value: string): Promise<void> {
    await this.page.locator(`input[name="${name}"]`).fill(value);
  }

  private async submitDialog(title = '提交'): Promise<void> {
    await this.page.getByRole('button', { name: title }).click();
  }

  private async selectSingle(label: string, value: string): Promise<void> {
    // Locate the form row containing the label text, then find the select trigger within it
    const group = this.page.locator('.cxd-Form-group, .cxd-Form-item').filter({ hasText: label });
    const trigger = group.locator('.cxd-Select').first();

    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    // Wait for dropdown overlay
    const overlay = this.page.locator('.cxd-Overlay').last();
    await expect(overlay).toBeVisible({ timeout: 5_000 });

    // Try keyboard search first
    const searchInput = overlay.locator('input').first();
    const hasSearch = (await searchInput.count()) > 0;

    if (hasSearch) {
      await searchInput.pressSequentially(value, { delay: 20 });
      await this.page.keyboard.press('Enter');
    } else {
      // Fallback: click the matching option directly
      await overlay.getByText(value, { exact: true }).first().click();
    }

    // Wait for overlay to close
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });

    // Verify the selected value is visible in the form row
    await expect(group.getByText(value, { exact: true })).toBeVisible({ timeout: 5_000 });
  }

  private async createProjectByApi(members: string[]): Promise<void> {
    if (!this.authToken) {
      throw new Error('Cannot create project by API before auth.login has stored a token.');
    }

    if (!this.latestProjectName) {
      throw new Error('Cannot create project by API before project.create has set a project name.');
    }

    const response = await this.page.request.post('https://zhengw-tech.com/expense/project/create', {
      headers: {
        Authorization: this.authToken
      },
      data: {
        members,
        projectName: this.latestProjectName,
        projectDesc: await this.page.locator('input[name="projectDesc"]').inputValue()
      }
    });
    const body = (await response.json()) as { status: number; msg?: string };

    if (body.status !== 0) {
      throw new Error(`Project API create failed: ${body.msg ?? JSON.stringify(body)}`);
    }

    this.latestProjectId = await this.findProjectIdByName(this.latestProjectName);
  }

  private async selectFirstVisibleOption(triggerText: string, optionText: string): Promise<void> {
    await this.page.getByText(triggerText).first().click();
    const option = this.page.getByText(optionText, { exact: true }).last();
    await expect(option).toBeVisible();
    await option.click();
  }

  private async findProjectIdByName(projectName: string): Promise<number> {
    if (!this.authToken) {
      throw new Error('Cannot query project list before auth.login has stored a token.');
    }

    const response = await this.page.request.get('https://zhengw-tech.com/expense/project/list?page=1&size=1000', {
      headers: {
        Authorization: this.authToken
      }
    });
    const body = (await response.json()) as {
      status: number;
      msg?: string;
      data?: {
        items?: Array<{
          projectId: number;
          projectName: string;
        }>;
      };
    };

    if (body.status !== 0) {
      throw new Error(`Project API list failed: ${body.msg ?? JSON.stringify(body)}`);
    }

    const project = body.data?.items?.find((item) => item.projectName === projectName);

    if (!project) {
      throw new Error(`Created project was not found by name: ${projectName}`);
    }

    return project.projectId;
  }

  private async createExpenseByApi(args: CreateExpenseArgs): Promise<void> {
    if (!this.authToken) {
      throw new Error('Cannot create expense by API before auth.login has stored a token.');
    }

    if (!this.latestProjectId || !this.latestProjectName) {
      throw new Error('Cannot create expense before project.create has produced a project id.');
    }

    const response = await this.page.request.post('https://zhengw-tech.com/expense/project/addRecord', {
      headers: {
        Authorization: this.authToken
      },
      data: {
        projectId: this.latestProjectId,
        projectName: this.latestProjectName,
        payMember: args.payer,
        consumerMembers: args.participants,
        amount: args.amount,
        date: Math.floor(Date.now() / 1000),
        expenseType: args.category,
        remark: args.remark ?? ''
      }
    });
    const body = (await response.json()) as { status: number; msg?: string };

    if (body.status !== 0) {
      throw new Error(`Expense API create failed: ${body.msg ?? JSON.stringify(body)}`);
    }
  }
}
