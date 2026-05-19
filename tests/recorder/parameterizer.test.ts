import { describe, test, expect } from 'vitest';
import { WorkflowParameterizer } from '../../src/core/recorder/parameterizer.js';
import { defaultRules } from '../../src/projects/expense/recorder-rules.js';

describe('WorkflowParameterizer', () => {
  const recorded = [
    {
      task: 'auth.login',
      args: { username: 'zhangsan', password: 'secret123' },
    },
    {
      task: 'project.create',
      args: { name: '团建 2024-05-18', description: '', members: ['张三', '李四'] },
    },
    {
      task: 'expense.create',
      args: { payer: '张三', participants: ['张三', '李四'], amount: 150, category: '饮食', remark: '午餐' },
    },
  ];

  const parameterizer = new WorkflowParameterizer(defaultRules);
  const { template, mapping } = parameterizer.parameterize(recorded as any);

  test('parameterizes username and password', () => {
    expect(template[0].args.username).toBe('${env.EXPENSE_USERNAME}');
    expect(template[0].args.password).toBe('${env.EXPENSE_PASSWORD}');
  });

  test('parameterizes project name', () => {
    expect(template[1].args.name).toBe('${input.projectName}');
  });

  test('parameterizes amount, category, remark', () => {
    expect(template[2].args.amount).toBe('${input.amount}');
    expect(template[2].args.category).toBe('${input.category}');
    expect(template[2].args.remark).toBe('${input.remark}');
  });

  test('non-matching fields remain unchanged', () => {
    expect(template[1].args.description).toBe('');
    expect(template[2].args.payer).toBe('张三');
  });

  test('mapping output contains expected entries', () => {
    expect(mapping.length).toBeGreaterThanOrEqual(6);
    const usernameMapping = mapping.find((m) => m.field === 'username' && m.task === 'auth.login');
    expect(usernameMapping).toBeDefined();
    expect(usernameMapping?.originalValue).toBe('zhangsan');
    expect(usernameMapping?.placeholder).toBe('${env.EXPENSE_USERNAME}');
  });
});
