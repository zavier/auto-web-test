import { WorkflowTaskSchema } from '../dsl.js';

export type ArgMeta = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Capability = {
  task: string;
  description: string;
  args: ArgMeta[];
};

type ZodSchemaLike = {
  def: {
    type: string;
    [key: string]: unknown;
  };
  type: string;
  description?: string;
};

function getBaseType(schema: ZodSchemaLike): string {
  const type = schema.def.type;
  if (type === 'optional') {
    const inner = schema.def.innerType as ZodSchemaLike;
    return getBaseType(inner);
  }
  if (type === 'array') {
    return 'array';
  }
  return type;
}

function isOptional(schema: ZodSchemaLike): boolean {
  return schema.def.type === 'optional';
}

export function getCapabilities(): Capability[] {
  const unionSchema = WorkflowTaskSchema as unknown as {
    def: {
      type: string;
      options: ZodSchemaLike[];
    };
  };

  const capabilities: Capability[] = [];

  for (const option of unionSchema.def.options) {
    const shape = (option.def as unknown as { shape: Record<string, ZodSchemaLike> }).shape;

    const taskSchema = shape.task;
    const literalValues = (taskSchema.def as unknown as { values: string[] }).values;
    const taskName = literalValues[0];
    const taskDescription = taskSchema.description ?? '';

    const argsSchema = shape.args;
    const argsShape = (argsSchema.def as unknown as { shape: Record<string, ZodSchemaLike> }).shape;

    const args: ArgMeta[] = [];
    for (const [argName, argSchema] of Object.entries(argsShape)) {
      args.push({
        name: argName,
        type: getBaseType(argSchema),
        required: !isOptional(argSchema),
        description: argSchema.description ?? '',
      });
    }

    capabilities.push({
      task: taskName,
      description: taskDescription,
      args,
    });
  }

  return capabilities;
}
