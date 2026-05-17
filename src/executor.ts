import type { Page } from '@playwright/test';
import type { Workflow, WorkflowTask, TaskOutput, WorkflowResult, TaskLog } from './dsl.js';
import { WorkflowSchema } from './dsl.js';
import { ExpenseApp } from './pages/expense-app.js';

export class WorkflowExecutor {
  private readonly app: ExpenseApp;

  constructor(page: Page) {
    this.app = new ExpenseApp(page);
  }

  async run(workflow: Workflow): Promise<WorkflowResult> {
    const parseResult = WorkflowSchema.safeParse(workflow);
    if (!parseResult.success) {
      throw new Error(`DSL validation failed: ${parseResult.error.message}`);
    }

    const result: WorkflowResult = {
      success: true,
      durationMs: 0,
      logs: [],
      outputs: {},
    };

    const workflowStart = Date.now();

    for (const step of parseResult.data) {
      const log: TaskLog = {
        task: step.task,
        status: 'started',
        startTime: Date.now(),
      };

      try {
        const output = await this.runTask(step);
        log.status = 'success';
        log.output = output;
      } catch (error) {
        log.status = 'failed';
        log.error = error instanceof Error ? error.message : String(error);
        result.success = false;
        break;
      } finally {
        log.endTime = Date.now();
        log.durationMs = log.endTime - log.startTime;
        result.logs.push(log);
      }
    }

    result.durationMs = Date.now() - workflowStart;
    return result;
  }

  private async runTask(step: WorkflowTask): Promise<TaskOutput> {
    switch (step.task) {
      case 'auth.login':
        await this.app.login(step.args);
        return undefined;
      case 'project.create':
        await this.app.createProject(step.args);
        return undefined;
      case 'project.addMembers':
        await this.app.addMembers(step.args);
        return undefined;
      case 'expense.create':
        await this.app.createExpense(step.args);
        return undefined;
      default: {
        const unreachable: never = step;
        throw new Error(`Unsupported task: ${JSON.stringify(unreachable)}`);
      }
    }
  }
}
