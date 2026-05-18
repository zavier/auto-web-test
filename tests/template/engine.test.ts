import { TemplateEngine } from '../../src/core/template/engine.js';
import type { VariableContext } from '../../src/core/template/types.js';

const baseContext: VariableContext = {
  env: { EXPENSE_USERNAME: 'admin', EXPENSE_PASSWORD: 'secret' },
  global: { defaultMembers: ['A', 'B'] },
  input: { suffix: 12345, amount: 100 },
  output: { projectCreate: { projectId: 42, projectName: '测试项目' } },
};

// Test A: whole-value replacement preserves type
const templateA = [{ task: 'auth.login', args: { username: '${env.EXPENSE_USERNAME}', amount: '${input.amount}' } }];
const resolvedA = TemplateEngine.resolve(templateA, baseContext);
console.assert(resolvedA[0].args.username === 'admin');
console.assert(resolvedA[0].args.amount === 100 && typeof resolvedA[0].args.amount === 'number');

// Test B: string interpolation
const templateB = [{ task: 'project.create', args: { name: '项目_${input.suffix}' } }];
const resolvedB = TemplateEngine.resolve(templateB, baseContext);
console.assert(resolvedB[0].args.name === '项目_12345');

// Test C: nested path
const templateC = [{ task: 'expense.create', args: { projectId: '${output.projectCreate.projectId}' } }];
const resolvedC = TemplateEngine.resolve(templateC, baseContext);
console.assert(resolvedC[0].args.projectId === 42);

// Test D: no variables — return as-is
const templateD = [{ task: 'auth.login', args: { username: 'fixed', amount: 50 } }];
const resolvedD = TemplateEngine.resolve(templateD, baseContext);
console.assert(resolvedD[0].args.username === 'fixed');
console.assert(resolvedD[0].args.amount === 50);

// Test E: arrays and objects
const templateE = [{ task: 'project.create', args: { members: '${global.defaultMembers}', nested: { x: '${input.amount}' } } }];
const resolvedE = TemplateEngine.resolve(templateE, baseContext);
const members = resolvedE[0].args.members;
console.assert(Array.isArray(members) && members[0] === 'A');
const nested = resolvedE[0].args.nested;
console.assert(typeof nested === 'object' && nested !== null && (nested as Record<string, unknown>).x === 100);

console.log('All engine tests passed');
