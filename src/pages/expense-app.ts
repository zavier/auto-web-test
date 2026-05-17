import { expect, type Page } from '@playwright/test';

type LoginArgs = {
  username: string;
  password: string;
};

type CreateProjectArgs = {
  name: string;
  description?: string;
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

  async createProject(args: CreateProjectArgs): Promise<void> {
    this.latestProjectName = args.name;
    await this.page.getByRole('button', { name: '创建项目' }).click();
    await this.page.locator('input[name="projectName"]').fill(args.name);
    await this.page.locator('input[name="projectDesc"]').fill(args.description ?? '');
  }

  async addMembers(args: AddMembersArgs): Promise<void> {
    for (const member of args.members) {
      await this.page.getByRole('button', { name: '新增', exact: true }).click();
      const input = this.page.locator('input[name="flat"]').last();
      await input.click();
      await input.pressSequentially(member, { delay: 20 });
      await this.page.keyboard.press('Tab');
    }

    await this.createProjectByApi(args.members);
    await this.page.goto('/expense/index-cdn.html#/project/list');
  }

  async createExpense(args: CreateExpenseArgs): Promise<void> {
    await this.createExpenseByApi(args);
    await this.page.goto(`/expense/index-cdn.html#/expense/${this.latestProjectId}/list`);
    await expect(this.page.getByText(args.remark ?? String(args.amount))).toBeVisible();
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
