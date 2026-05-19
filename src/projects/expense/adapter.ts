import type { Page } from '@playwright/test';
import type { ProjectAdapter, TaskContext } from '../../core/planner/types.js';
import { getExpenseCapabilities } from './capabilities.js';
import { ExpensePage } from './pages/expense-page.js';
import { ExpenseApiClient } from './api-client.js';

export class ExpenseAdapter implements ProjectAdapter {
  readonly project = 'expense';
  private readonly page: ExpensePage;
  private readonly api: ExpenseApiClient;

  constructor(page: Page) {
    this.page = new ExpensePage(page);
    this.api = new ExpenseApiClient(page.request);
  }

  getCapabilities() {
    return getExpenseCapabilities();
  }

  async executeTask(task: string, args: unknown, context: TaskContext): Promise<unknown> {
    switch (task) {
      case 'auth.login': {
        const { username, password } = args as { username: string; password: string };
        const token = await this.page.login({ username, password });
        return { authToken: token };
      }
      case 'project.create': {
        const { name, description, members } = args as {
          name: string;
          description?: string;
          members?: string[];
        };
        await this.page.openCreateProjectDialog();
        await this.page.fillProjectName(name);
        await this.page.fillProjectDescription(description ?? '');
        if (members) {
          await this.page.fillMembers(members);
        }
        const projectDesc = await this.page.getProjectDescription();
        const authToken = context.outputs.authToken as string | undefined;
        if (!authToken) {
          throw new Error('auth.login must run before project.create to provide authToken');
        }
        const projectId = await this.api.createProject(authToken, name, projectDesc, members ?? []);
        await this.page.clickCancel();
        await this.page.navigateToProjectList();
        return { projectId, projectName: name };
      }
      case 'project.addMembers': {
        const { members } = args as { members: string[] };
        const projectName = context.outputs.projectName as string | undefined;
        if (!projectName) {
          throw new Error('project.create must run before project.addMembers to provide projectName');
        }
        await this.page.navigateToProjectList();
        await this.page.openProjectEdit(projectName);
        await this.page.fillMembers(members);
        await this.page.submitMembersForm();
        await this.page.navigateToProjectList();
        return { projectId: context.outputs.projectId };
      }
      case 'expense.create': {
        const { payer, participants, amount, category, remark } = args as {
          payer: string;
          participants: string[];
          amount: number;
          category: string;
          remark?: string;
        };
        const authToken = context.outputs.authToken as string | undefined;
        const projectId = context.outputs.projectId as number | undefined;
        const projectName = context.outputs.projectName as string | undefined;
        if (!authToken || !projectId || !projectName) {
          throw new Error('auth.login and project.create must run before expense.create');
        }
        await this.api.addRecord(
          authToken,
          projectId,
          projectName,
          payer,
          participants,
          amount,
          category,
          remark ?? ''
        );
        await this.page.navigateToExpenseList(projectId);
        await this.page.assertExpenseVisible(remark ?? String(amount));
        return undefined;
      }
      default:
        throw new Error(`Unsupported task: ${task}`);
    }
  }
}
