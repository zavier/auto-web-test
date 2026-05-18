import { WorkflowParameterizer } from '../../src/core/recorder/parameterizer.js';
import { defaultRules } from '../../src/projects/expense/recorder-rules.js';

function assert(condition: unknown, message = 'unknown'): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

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

// Verify username and password are parameterized
assert(template[0].args.username === '${env.EXPENSE_USERNAME}');
assert(template[0].args.password === '${env.EXPENSE_PASSWORD}');

// Verify project name is parameterized
assert(template[1].args.name === '${input.projectName}');

// Verify amount, category, remark are parameterized
assert(template[2].args.amount === '${input.amount}');
assert(template[2].args.category === '${input.category}');
assert(template[2].args.remark === '${input.remark}');

// Verify non-matching fields remain unchanged
assert(template[1].args.description === '');
assert(template[2].args.payer === '张三');

// Verify mapping output
assert(mapping.length >= 6, `Expected at least 6 mappings, got ${mapping.length}`);
const usernameMapping = mapping.find((m) => m.field === 'username' && m.task === 'auth.login');
assert(usernameMapping?.originalValue === 'zhangsan');
assert(usernameMapping?.placeholder === '${env.EXPENSE_USERNAME}');

console.log('All parameterizer tests passed');
