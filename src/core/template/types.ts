export type VariableContext = {
  env: Record<string, string>;
  global: Record<string, unknown>;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type TemplateWorkflow = Array<{
  task: string;
  args: Record<string, unknown>;
}>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}
