import type { APIRequestContext } from '@playwright/test';

export class ExpenseApiClient {
  constructor(private readonly request: APIRequestContext) {}

  async createProject(
    token: string,
    name: string,
    description: string,
    members: string[]
  ): Promise<number> {
    const response = await this.request.post('https://zhengw-tech.com/expense/project/create', {
      headers: { Authorization: token },
      data: { members, projectName: name, projectDesc: description },
    });
    const body = (await response.json()) as { status: number; msg?: string };

    if (body.status !== 0) {
      throw new Error(`Project API create failed: ${body.msg ?? JSON.stringify(body)}`);
    }

    return this.findProjectIdByName(token, name);
  }

  async addRecord(
    token: string,
    projectId: number,
    projectName: string,
    payer: string,
    participants: string[],
    amount: number,
    category: string,
    remark: string
  ): Promise<void> {
    const response = await this.request.post('https://zhengw-tech.com/expense/project/addRecord', {
      headers: { Authorization: token },
      data: {
        projectId,
        projectName,
        payMember: payer,
        consumerMembers: participants,
        amount,
        date: Math.floor(Date.now() / 1000),
        expenseType: category,
        remark,
      },
    });
    const body = (await response.json()) as { status: number; msg?: string };

    if (body.status !== 0) {
      throw new Error(`Expense API create failed: ${body.msg ?? JSON.stringify(body)}`);
    }
  }

  private async findProjectIdByName(token: string, projectName: string): Promise<number> {
    const response = await this.request.get(
      'https://zhengw-tech.com/expense/project/list?page=1&size=1000',
      { headers: { Authorization: token } }
    );
    const body = (await response.json()) as {
      status: number;
      msg?: string;
      data?: {
        items?: Array<{ projectId: number; projectName: string }>;
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
}
