import { VariableContextBuilder, buildContext } from '../../src/core/template/context.js';

function assert(condition: unknown, message = 'unknown'): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test buildContext defaults
process.env.TEST_VAR = 'hello';
const ctx1 = buildContext();
assert(ctx1.env.TEST_VAR === 'hello');
assert(ctx1.input !== undefined);
assert(ctx1.output !== undefined);
assert(ctx1.global !== undefined);

// Test buildContext with overrides
const ctx2 = buildContext({
  input: { amount: 100 },
  global: { baseUrl: 'http://test' },
});
assert(ctx2.input.amount === 100);
assert(ctx2.global.baseUrl === 'http://test');
assert(ctx2.env.TEST_VAR === 'hello');

// Test VariableContextBuilder
const builder = new VariableContextBuilder()
  .withEnv({ FOO: 'bar' })
  .withInput({ suffix: 1 })
  .withOutput('projectCreate', { projectId: 99 })
  .withGlobal({ members: ['a'] });

const ctx3 = builder.build();
assert(ctx3.env.FOO === 'bar');
assert(ctx3.input.suffix === 1);
assert((ctx3.output.projectCreate as Record<string, unknown>).projectId === 99);
assert((ctx3.global.members as string[])[0] === 'a');

// Test withEnv filters undefined
const builderWithUndefined = new VariableContextBuilder()
  .withEnv({ FOO: 'bar', BAR: undefined });
const ctxWithUndefined = builderWithUndefined.build();
assert(ctxWithUndefined.env.FOO === 'bar');
assert(!('BAR' in ctxWithUndefined.env), 'BAR should be filtered out');

// Test withOutput accumulates
const builder2 = new VariableContextBuilder()
  .withOutput('projectCreate', { projectId: 1 })
  .withOutput('expenseCreate', { recordId: 2 });
const ctx4 = builder2.build();
assert((ctx4.output.projectCreate as Record<string, unknown>).projectId === 1);
assert((ctx4.output.expenseCreate as Record<string, unknown>).recordId === 2);

console.log('All context tests passed');
