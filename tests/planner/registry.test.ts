import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

const caps = getCapabilities(WorkflowTaskSchema, 'expense');

console.assert(caps.length === 4, `Expected 4, got ${caps.length}`);

const tasks = caps.map((c) => c.task);
console.assert(tasks.includes('auth.login'));
console.assert(tasks.includes('project.create'));
console.assert(tasks.includes('project.addMembers'));
console.assert(tasks.includes('expense.create'));

for (const cap of caps) {
  console.assert(cap.description.length > 0, `${cap.task} missing description`);
  console.assert(cap.args.length > 0, `${cap.task} has no args`);
  console.assert(cap.project === 'expense', `${cap.task} project mismatch`);
}

const expenseCap = caps.find((c) => c.task === 'expense.create')!;
const argNames = expenseCap.args.map((a) => a.name);
console.assert(argNames.includes('payer'));
console.assert(argNames.includes('participants'));
console.assert(argNames.includes('amount'));
console.assert(argNames.includes('category'));
console.assert(argNames.includes('remark'));

const remarkArg = expenseCap.args.find((a) => a.name === 'remark')!;
console.assert(remarkArg.required === false);
console.assert(remarkArg.type === 'string');

const amountArg = expenseCap.args.find((a) => a.name === 'amount')!;
console.assert(amountArg.type === 'number');

const participantsArg = expenseCap.args.find((a) => a.name === 'participants')!;
console.assert(participantsArg.type === 'array');

console.log('All registry tests passed');
