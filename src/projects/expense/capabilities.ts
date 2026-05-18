import type { Capability } from '../../core/planner/types.js';
import { getCapabilities } from '../../core/planner/registry.js';
import { WorkflowTaskSchema } from './tasks.js';

export function getExpenseCapabilities(): Capability[] {
  return getCapabilities(WorkflowTaskSchema, 'expense');
}
