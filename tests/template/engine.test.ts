import { describe, test, expect } from 'vitest';
import { TemplateEngine } from '../../src/core/template/engine.js';
import { TemplateError } from '../../src/core/template/types.js';
import type { VariableContext } from '../../src/core/template/types.js';

const baseContext: VariableContext = {
  env: { EXPENSE_USERNAME: 'admin', EXPENSE_PASSWORD: 'secret' },
  global: { defaultMembers: ['A', 'B'] },
  input: { suffix: 12345, amount: 100 },
  output: { projectCreate: { projectId: 42, projectName: '测试项目' } },
};

describe('TemplateEngine', () => {
  test('whole-value replacement preserves type', () => {
    const template = [{ task: 'auth.login', args: { username: '${env.EXPENSE_USERNAME}', amount: '${input.amount}' } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(resolved[0].args.username).toBe('admin');
    expect(resolved[0].args.amount).toBe(100);
    expect(typeof resolved[0].args.amount).toBe('number');
  });

  test('string interpolation', () => {
    const template = [{ task: 'project.create', args: { name: '项目_${input.suffix}' } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(resolved[0].args.name).toBe('项目_12345');
  });

  test('nested path', () => {
    const template = [{ task: 'expense.create', args: { projectId: '${output.projectCreate.projectId}' } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(resolved[0].args.projectId).toBe(42);
  });

  test('no variables returns as-is', () => {
    const template = [{ task: 'auth.login', args: { username: 'fixed', amount: 50 } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(resolved[0].args.username).toBe('fixed');
    expect(resolved[0].args.amount).toBe(50);
  });

  test('arrays and objects are resolved', () => {
    const template = [{ task: 'project.create', args: { members: '${global.defaultMembers}', nested: { x: '${input.amount}' } } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(Array.isArray(resolved[0].args.members)).toBe(true);
    expect((resolved[0].args.members as string[])[0]).toBe('A');
    expect(typeof resolved[0].args.nested).toBe('object');
    expect((resolved[0].args.nested as Record<string, unknown>).x).toBe(100);
  });

  test('undefined scoped variable throws TemplateError', () => {
    const template = [{ task: 'auth.login', args: { x: '${env.MISSING}' } }];
    expect(() => TemplateEngine.resolve(template, baseContext)).toThrow(TemplateError);
  });

  test('unscoped variable throws TemplateError requiring explicit prefix', () => {
    const template = [{ task: 'auth.login', args: { x: '${missingVar}' } }];
    expect(() => TemplateEngine.resolve(template, baseContext)).toThrow(TemplateError);
    expect(() => TemplateEngine.resolve(template, baseContext)).toThrow(/explicit scope prefix/);
  });

  test('empty workflow returns empty array', () => {
    const resolved = TemplateEngine.resolve([], baseContext);
    expect(resolved).toEqual([]);
  });

  test('multiple interpolations in one string', () => {
    const template = [{ task: 'project.create', args: { name: '${env.EXPENSE_USERNAME}_${input.suffix}' } }];
    const resolved = TemplateEngine.resolve(template, baseContext);
    expect(resolved[0].args.name).toBe('admin_12345');
  });

  test('circular reference does not crash', () => {
    const circularContext: VariableContext = {
      env: {},
      global: {},
      input: {},
      output: { a: {} as Record<string, unknown> },
    };
    circularContext.output.a = circularContext.output;
    const template = [{ task: 'project.create', args: { ref: '${output.a}' } }];
    const resolved = TemplateEngine.resolve(template, circularContext);
    expect(typeof resolved[0].args.ref).toBe('object');
  });
});
