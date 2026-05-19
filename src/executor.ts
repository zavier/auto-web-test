import type { TaskOutput, WorkflowResult, TaskLog } from './core/dsl/types.js';
import { TemplateEngine } from './core/template/engine.js';
import { buildContext } from './core/template/context.js';
import type { VariableContext, TemplateWorkflow } from './core/template/types.js';
import type { ProjectAdapter } from './core/planner/types.js';

type GenericWorkflowTask = {
  task: string;
  args: Record<string, unknown>;
};

export class WorkflowExecutor {
  private readonly adapter: ProjectAdapter;

  constructor(adapter: ProjectAdapter) {
    this.adapter = adapter;
  }

  async run(
    workflow: Array<GenericWorkflowTask> | TemplateWorkflow,
    options?: { context?: Partial<VariableContext> }
  ): Promise<WorkflowResult> {
    const hasTemplate = JSON.stringify(workflow).includes('${');
    const resolved = hasTemplate
      ? TemplateEngine.resolve(workflow, buildContext(options?.context))
      : workflow;

    const result: WorkflowResult = {
      success: true,
      durationMs: 0,
      logs: [],
      outputs: {},
    };

    const workflowStart = Date.now();

    for (const step of resolved as Array<GenericWorkflowTask>) {
      const log: TaskLog = {
        task: step.task,
        status: 'started',
        startTime: Date.now(),
      };

      try {
        const output = await this.adapter.executeTask(step.task, step.args, { outputs: result.outputs });
        log.status = 'success';
        log.output = output as TaskOutput;
        if (output) {
          Object.assign(result.outputs, output);
        }
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
}
