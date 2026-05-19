import type { ZodType } from 'zod';
import type { ArgMeta, Capability } from './types.js';

function getBaseType(schema: ZodType): string {
  const type = (schema as any).type;
  if (type === 'optional') {
    return getBaseType((schema as any).unwrap());
  }
  if (type === 'array') {
    return 'array';
  }
  return type;
}

function isOptional(schema: ZodType): boolean {
  return (schema as any).type === 'optional';
}

export function getCapabilities(workflowTaskSchema: ZodType, projectName: string): Capability[] {
  const options = (workflowTaskSchema as any).options as ZodType[];
  const capabilities: Capability[] = [];

  for (const option of options) {
    const shape = (option as any).shape as Record<string, ZodType>;

    const taskSchema = shape.task;
    const taskName = (taskSchema as any).value as string;
    const taskDescription = (taskSchema as any).description ?? '';

    const argsSchema = shape.args;
    const argsShape = (argsSchema as any).shape as Record<string, ZodType>;

    const args: ArgMeta[] = [];
    for (const [argName, argSchema] of Object.entries(argsShape)) {
      args.push({
        name: argName,
        type: getBaseType(argSchema),
        required: !isOptional(argSchema),
        description: (argSchema as any).description ?? '',
      });
    }

    capabilities.push({
      task: taskName,
      description: taskDescription,
      args,
      project: projectName,
      riskLevel: 'write',
    });
  }

  return capabilities;
}
