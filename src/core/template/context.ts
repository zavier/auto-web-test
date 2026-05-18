import type { VariableContext } from './types.js';

export function buildContext(partial?: Partial<VariableContext>): VariableContext {
  return {
    env: partial?.env ?? (process.env as Record<string, string>),
    global: partial?.global ?? {},
    input: partial?.input ?? {},
    output: partial?.output ?? {},
  };
}

export class VariableContextBuilder {
  private context: VariableContext = {
    env: {},
    global: {},
    input: {},
    output: {},
  };

  withEnv(env: Record<string, string | undefined>): this {
    this.context.env = Object.fromEntries(
      Object.entries(env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;
    return this;
  }

  withGlobal(global: Record<string, unknown>): this {
    this.context.global = { ...this.context.global, ...global };
    return this;
  }

  withInput(input: Record<string, unknown>): this {
    this.context.input = { ...this.context.input, ...input };
    return this;
  }

  withOutput(taskName: string, output: Record<string, unknown>): this {
    this.context.output = { ...this.context.output, [taskName]: output };
    return this;
  }

  build(): VariableContext {
    return { ...this.context };
  }
}
