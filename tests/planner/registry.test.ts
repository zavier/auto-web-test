import { describe, test, expect } from 'vitest';
import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

describe('Capability Registry', () => {
  const caps = getCapabilities(WorkflowTaskSchema, 'expense');

  test('extracts all 4 expense capabilities', () => {
    expect(caps).toHaveLength(4);
  });

  test('includes all expected tasks', () => {
    const tasks = caps.map((c) => c.task);
    expect(tasks).toContain('auth.login');
    expect(tasks).toContain('project.create');
    expect(tasks).toContain('project.addMembers');
    expect(tasks).toContain('expense.create');
  });

  test('each capability has description and args', () => {
    for (const cap of caps) {
      expect(cap.description.length).toBeGreaterThan(0);
      expect(cap.args.length).toBeGreaterThan(0);
      expect(cap.project).toBe('expense');
    }
  });

  test('expense.create has correct args', () => {
    const expenseCap = caps.find((c) => c.task === 'expense.create')!;
    const argNames = expenseCap.args.map((a) => a.name);
    expect(argNames).toContain('payer');
    expect(argNames).toContain('participants');
    expect(argNames).toContain('amount');
    expect(argNames).toContain('category');
    expect(argNames).toContain('remark');
  });

  test('remark is optional string', () => {
    const expenseCap = caps.find((c) => c.task === 'expense.create')!;
    const remarkArg = expenseCap.args.find((a) => a.name === 'remark')!;
    expect(remarkArg.required).toBe(false);
    expect(remarkArg.type).toBe('string');
  });

  test('amount is number', () => {
    const expenseCap = caps.find((c) => c.task === 'expense.create')!;
    const amountArg = expenseCap.args.find((a) => a.name === 'amount')!;
    expect(amountArg.type).toBe('number');
  });

  test('participants is array', () => {
    const expenseCap = caps.find((c) => c.task === 'expense.create')!;
    const participantsArg = expenseCap.args.find((a) => a.name === 'participants')!;
    expect(participantsArg.type).toBe('array');
  });
});
