import { TemplateError, type TemplateWorkflow, type VariableContext } from './types.js';

export class TemplateEngine {
  static resolve(workflow: TemplateWorkflow, context: VariableContext): TemplateWorkflow {
    return workflow.map((step) => ({
      task: step.task,
      args: this.resolveValue(step.args, context) as Record<string, unknown>,
    }));
  }

  private static resolveValue(value: unknown, context: VariableContext): unknown {
    if (typeof value === 'string') {
      return this.resolveString(value, context);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, context));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.resolveValue(val, context);
      }
      return result;
    }
    return value;
  }

  private static resolveString(str: string, context: VariableContext): unknown {
    const wholeMatch = str.match(/^\$\{([^}]+)\}$/);
    if (wholeMatch) {
      return this.lookup(wholeMatch[1], context);
    }
    return str.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const val = this.lookup(path, context);
      return String(val);
    });
  }

  private static lookup(path: string, context: VariableContext): unknown {
    const parts = path.split('.');
    const scopes: (keyof VariableContext)[] = ['output', 'input', 'env', 'global'];

    let root: unknown;
    let keys: string[] = [];

    if (parts[0] === 'env' || parts[0] === 'global' || parts[0] === 'input' || parts[0] === 'output') {
      root = context[parts[0] as keyof VariableContext];
      keys = parts.slice(1);
    } else {
      for (const scope of scopes) {
        const scopeObj = context[scope];
        if (scopeObj !== null && typeof scopeObj === 'object' && parts[0] in scopeObj) {
          root = scopeObj;
          keys = parts;
          break;
        }
      }
    }

    if (root === undefined) {
      throw new TemplateError(
        `Template variable '${path}' not found. Available: ${this.getAvailableNames(context).slice(0, 10).join(', ')}`
      );
    }

    let current: unknown = root;
    for (const key of keys) {
      if (current !== null && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        throw new TemplateError(
          `Template variable '${path}' not found. Available: ${this.getAvailableNames(context).slice(0, 10).join(', ')}`
        );
      }
    }
    return current;
  }

  private static getAvailableNames(context: VariableContext): string[] {
    const names: string[] = [];
    const scopes: (keyof VariableContext)[] = ['env', 'global', 'input', 'output'];
    for (const scope of scopes) {
      names.push(...this.collectPaths(context[scope], scope));
    }
    return names;
  }

  private static collectPaths(obj: unknown, prefix: string): string[] {
    if (obj === null || typeof obj !== 'object') {
      return [prefix];
    }
    if (Array.isArray(obj)) {
      return [prefix];
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return [prefix];
    }
    const paths: string[] = [];
    for (const [key, value] of entries) {
      paths.push(...this.collectPaths(value, `${prefix}.${key}`));
    }
    return paths;
  }
}
