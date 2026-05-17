import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask } from './dsl.js';
import { ExpenseApp } from './pages/expense-app.js';

export class WorkflowExecutor {
  private readonly app: ExpenseApp;

  constructor(page: Page) {
    this.app = new ExpenseApp(page);
  }

  async run(workflow: Workflow): Promise<void> {
    for (const step of workflow) {
      await this.runTask(step);
    }
  }

  private async runTask(step: WorkflowTask): Promise<void> {
    switch (step.task) {
      case 'auth.login':
        await this.app.login(step.args);
        return;
      case 'project.create':
        await this.app.createProject(step.args);
        return;
      case 'project.addMembers':
        await this.app.addMembers(step.args);
        return;
      case 'expense.create':
        await this.app.createExpense(step.args);
        return;
      default: {
        const unreachable: never = step;
        throw new Error(`Unsupported task: ${JSON.stringify(unreachable)}`);
      }
    }
  }
}
