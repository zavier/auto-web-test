import { WorkflowParameterizer } from '../../src/core/recorder/parameterizer.js';
import { defaultRules } from '../../src/core/recorder/rules.js';

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
console.assert(template[0].args.username === '${env.EXPENSE_USERNAME}');
console.assert(template[0].args.password === '${env.EXPENSE_PASSWORD}');

// Verify project name is parameterized
console.assert(template[1].args.name === '${input.projectName}');

// Verify amount, category, remark are parameterized
console.assert(template[2].args.amount === '${input.amount}');
console.assert(template[2].args.category === '${input.category}');
console.assert(template[2].args.remark === '${input.remark}');

// Verify non-matching fields remain unchanged
console.assert(template[1].args.description === '');
console.assert(template[2].args.payer === '张三');

// Verify mapping output
console.assert(mapping.length >= 6, `Expected at least 6 mappings, got ${mapping.length}`);
const usernameMapping = mapping.find((m) => m.field === 'username' && m.task === 'auth.login');
console.assert(usernameMapping?.originalValue === 'zhangsan');
console.assert(usernameMapping?.placeholder === '${env.EXPENSE_USERNAME}');

console.log('All parameterizer tests passed');
