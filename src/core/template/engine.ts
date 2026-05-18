import { TemplateError, type TemplateWorkflow, type VariableContext } from './types.js';

export class TemplateEngine {
  static resolve(workflow: TemplateWorkflow, context: VariableContext): TemplateWorkflow {
    return workflow.map((step) => ({
      task: step.task,
      args: this.resolveValue(step.args, context) as Record<string, unknown>,
    }));
  }

  private static resolveValue(value: unknown, context: VariableContext, visited: WeakSet<object> = new WeakSet()): unknown {
    if (typeof value === 'string') {
      return this.resolveString(value, context);
    }
    if (Array.isArray(value)) {
      if (visited.has(value)) {
        return value;
      }
      visited.add(value);
      return value.map((item) => this.resolveValue(item, context, visited));
    }
    if (value !== null && typeof value === 'object') {
      if (visited.has(value)) {
        return value;
      }
      visited.add(value);
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.resolveValue(val, context, visited);
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
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
        throw new TemplateError(
          `Template variable '${path}' resolved to non-primitive value and cannot be used in string interpolation.`
        );
      }
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
    const visited = new WeakSet<object>();
    for (const scope of scopes) {
      names.push(...this.collectPaths(context[scope], scope, visited));
    }
    return names;
  }

  private static collectPaths(obj: unknown, prefix: string, visited: WeakSet<object> = new WeakSet()): string[] {
    if (obj === null || typeof obj !== 'object') {
      return [prefix];
    }
    if (Array.isArray(obj)) {
      return [prefix];
    }
    if (visited.has(obj)) {
      return [prefix];
    }
    visited.add(obj);
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return [prefix];
    }
    const paths: string[] = [];
    for (const [key, value] of entries) {
      paths.push(...this.collectPaths(value, `${prefix}.${key}`, visited));
    }
    return paths;
  }
}
