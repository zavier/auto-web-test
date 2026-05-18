import type { ParameterizeRule } from './rules.js';
import type { TemplateWorkflow } from '../template/types.js';

export type ParamMapping = {
  task: string;
  field: string;
  originalValue: unknown;
  placeholder: string;
  scope: 'env' | 'input' | 'global';
};

export class WorkflowParameterizer {
  constructor(private rules: ParameterizeRule[]) {}

  parameterize(workflow: TemplateWorkflow): {
    template: TemplateWorkflow;
    mapping: ParamMapping[];
  } {
    const mapping: ParamMapping[] = [];

    const template = workflow.map((step) => {
      const parameterizedArgs: Record<string, unknown> = {};

      for (const [field, value] of Object.entries(step.args)) {
        const rule = this.findRule(step.task, field);
        if (rule) {
          const placeholder = `\${${rule.paramName}}`;
          parameterizedArgs[field] = placeholder;
          mapping.push({
            task: step.task,
            field,
            originalValue: value,
            placeholder,
            scope: rule.scope,
          });
        } else {
          parameterizedArgs[field] = value;
        }
      }

      return { ...step, args: parameterizedArgs };
    });

    return { template, mapping };
  }

  private findRule(task: string, field: string): ParameterizeRule | undefined {
    return this.rules.find((rule) => {
      const fieldMatches =
        typeof rule.fieldPattern === 'string'
          ? rule.fieldPattern === field
          : rule.fieldPattern.test(field);
      if (!fieldMatches) return false;

      if (rule.taskPattern) {
        const taskMatches =
          typeof rule.taskPattern === 'string'
            ? rule.taskPattern === task
            : rule.taskPattern.test(task);
        if (!taskMatches) return false;
      }

      return true;
    });
  }
}
