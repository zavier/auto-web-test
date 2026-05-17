import { getCapabilities } from '../src/planner/registry.js';

const caps = getCapabilities();

// Verify 4 capabilities extracted
console.assert(caps.length === 4, `Expected 4, got ${caps.length}`);

const tasks = caps.map(c => c.task);
console.assert(tasks.includes('auth.login'));
console.assert(tasks.includes('project.create'));
console.assert(tasks.includes('project.addMembers'));
console.assert(tasks.includes('expense.create'));

// Each has description and args
for (const cap of caps) {
  console.assert(cap.description.length > 0, `${cap.task} missing description`);
  console.assert(cap.args.length > 0, `${cap.task} has no args`);
}

// expense.create args
const expenseCap = caps.find(c => c.task === 'expense.create')!;
const argNames = expenseCap.args.map(a => a.name);
console.assert(argNames.includes('payer'));
console.assert(argNames.includes('participants'));
console.assert(argNames.includes('amount'));
console.assert(argNames.includes('category'));
console.assert(argNames.includes('remark'));

const remarkArg = expenseCap.args.find(a => a.name === 'remark')!;
console.assert(remarkArg.required === false, 'remark should be optional');
console.assert(remarkArg.type === 'string', `remark type should be string, got ${remarkArg.type}`);

// amount should be number
const amountArg = expenseCap.args.find(a => a.name === 'amount')!;
console.assert(amountArg.type === 'number', `amount type should be number, got ${amountArg.type}`);

// participants should be array
const participantsArg = expenseCap.args.find(a => a.name === 'participants')!;
console.assert(participantsArg.type === 'array', `participants type should be array, got ${participantsArg.type}`);

console.log('All registry tests passed');
