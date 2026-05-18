import { TemplateEngine } from '../../src/core/template/engine.js';
import { TemplateError } from '../../src/core/template/types.js';
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

function assertThrowsTemplateError(fn: () => void, expectedInMessage: string): void {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    console.assert(e instanceof TemplateError, `Expected TemplateError, got ${e}`);
    console.assert(e instanceof Error && e.message.includes(expectedInMessage), `Message should include ${expectedInMessage}`);
  }
  console.assert(threw, 'Expected TemplateError to be thrown');
}

// Test F: undefined scoped variable throws TemplateError
assertThrowsTemplateError(
  () => TemplateEngine.resolve([{ task: 'auth.login', args: { x: '${env.MISSING}' } }], baseContext),
  'MISSING'
);

// Test G: undefined unscoped variable throws TemplateError
assertThrowsTemplateError(
  () => TemplateEngine.resolve([{ task: 'auth.login', args: { x: '${missingVar}' } }], baseContext),
  'missingVar'
);

// Test H: empty workflow returns empty array
const resolvedH = TemplateEngine.resolve([], baseContext);
console.assert(Array.isArray(resolvedH) && resolvedH.length === 0);

// Test I: multiple interpolations in one string
const templateI = [{ task: 'project.create', args: { name: '${env.EXPENSE_USERNAME}_${input.suffix}' } }];
const resolvedI = TemplateEngine.resolve(templateI, baseContext);
console.assert(resolvedI[0].args.name === 'admin_12345');

// Test J: circular reference does not crash
const circularContext: VariableContext = {
  env: {},
  global: {},
  input: {},
  output: { a: {} as Record<string, unknown> },
};
circularContext.output.a = circularContext.output;
const templateJ = [{ task: 'project.create', args: { ref: '${output.a}' } }];
const resolvedJ = TemplateEngine.resolve(templateJ, circularContext);
console.assert(typeof resolvedJ[0].args.ref === 'object');

console.log('All engine tests passed');
