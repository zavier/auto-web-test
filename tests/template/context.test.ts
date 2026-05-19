import { describe, test, expect } from 'vitest';
import { VariableContextBuilder, buildContext } from '../../src/core/template/context.js';

describe('Template Context', () => {
  test('buildContext defaults include env', () => {
    process.env.TEST_VAR = 'hello';
    const ctx = buildContext();
    expect(ctx.env.TEST_VAR).toBe('hello');
    expect(ctx.input).toBeDefined();
    expect(ctx.output).toBeDefined();
    expect(ctx.global).toBeDefined();
  });

  test('buildContext with overrides', () => {
    const ctx = buildContext({
      input: { amount: 100 },
      global: { baseUrl: 'http://test' },
    });
    expect(ctx.input.amount).toBe(100);
    expect(ctx.global.baseUrl).toBe('http://test');
    expect(ctx.env.TEST_VAR).toBe('hello');
  });

  test('VariableContextBuilder builds correctly', () => {
    const builder = new VariableContextBuilder()
      .withEnv({ FOO: 'bar' })
      .withInput({ suffix: 1 })
      .withOutput('projectCreate', { projectId: 99 })
      .withGlobal({ members: ['a'] });

    const ctx = builder.build();
    expect(ctx.env.FOO).toBe('bar');
    expect(ctx.input.suffix).toBe(1);
    expect((ctx.output.projectCreate as Record<string, unknown>).projectId).toBe(99);
    expect((ctx.global.members as string[])[0]).toBe('a');
  });

  test('VariableContextBuilder filters undefined env values', () => {
    const builder = new VariableContextBuilder()
      .withEnv({ FOO: 'bar', BAR: undefined });
    const ctx = builder.build();
    expect(ctx.env.FOO).toBe('bar');
    expect('BAR' in ctx.env).toBe(false);
  });

  test('VariableContextBuilder accumulates output', () => {
    const builder = new VariableContextBuilder()
      .withOutput('projectCreate', { projectId: 1 })
      .withOutput('expenseCreate', { recordId: 2 });
    const ctx = builder.build();
    expect((ctx.output.projectCreate as Record<string, unknown>).projectId).toBe(1);
    expect((ctx.output.expenseCreate as Record<string, unknown>).recordId).toBe(2);
  });
});
