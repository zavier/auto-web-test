import { VariableContextBuilder, buildContext } from '../../src/core/template/context.js';

// Test buildContext defaults
process.env.TEST_VAR = 'hello';
const ctx1 = buildContext();
console.assert(ctx1.env.TEST_VAR === 'hello');
console.assert(ctx1.input !== undefined);
console.assert(ctx1.output !== undefined);
console.assert(ctx1.global !== undefined);

// Test buildContext with overrides
const ctx2 = buildContext({
  input: { amount: 100 },
  global: { baseUrl: 'http://test' },
});
console.assert(ctx2.input.amount === 100);
console.assert(ctx2.global.baseUrl === 'http://test');
console.assert(ctx2.env.TEST_VAR === 'hello');

// Test VariableContextBuilder
const builder = new VariableContextBuilder()
  .withEnv({ FOO: 'bar' })
  .withInput({ suffix: 1 })
  .withOutput('projectCreate', { projectId: 99 })
  .withGlobal({ members: ['a'] });

const ctx3 = builder.build();
console.assert(ctx3.env.FOO === 'bar');
console.assert(ctx3.input.suffix === 1);
console.assert((ctx3.output.projectCreate as Record<string, unknown>).projectId === 99);
console.assert((ctx3.global.members as string[])[0] === 'a');

// Test withEnv filters undefined
const builderWithUndefined = new VariableContextBuilder()
  .withEnv({ FOO: 'bar', BAR: undefined });
const ctxWithUndefined = builderWithUndefined.build();
console.assert(ctxWithUndefined.env.FOO === 'bar');
console.assert(!('BAR' in ctxWithUndefined.env), 'BAR should be filtered out');

// Test withOutput accumulates
const builder2 = new VariableContextBuilder()
  .withOutput('projectCreate', { projectId: 1 })
  .withOutput('expenseCreate', { recordId: 2 });
const ctx4 = builder2.build();
console.assert((ctx4.output.projectCreate as Record<string, unknown>).projectId === 1);
console.assert((ctx4.output.expenseCreate as Record<string, unknown>).recordId === 2);

console.log('All context tests passed');
