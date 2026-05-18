import { createPlanner } from '../../src/core/planner/planner.js';
import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowSchema, WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

const capabilities = getCapabilities(WorkflowTaskSchema, 'expense');
const planner = createPlanner({ openaiApiKey: 'sk-test' }, capabilities, WorkflowSchema);

const result = await planner.plan('');
console.assert(Array.isArray(result) && result.length === 0, 'Empty input should return empty array');

const badPlanner = createPlanner({ openaiApiKey: 'sk-invalid' }, capabilities, WorkflowSchema);
try {
  await badPlanner.plan('创建一个项目');
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.assert(e instanceof Error);
}

console.log('All planner tests passed');
