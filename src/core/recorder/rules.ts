export type ParameterizeRule = {
  fieldPattern: string | RegExp;
  taskPattern?: string | RegExp;
  paramName: string;
  scope: 'env' | 'input' | 'global';
};

export const defaultRules: ParameterizeRule[] = [
  { fieldPattern: 'username', paramName: 'env.EXPENSE_USERNAME', scope: 'env' },
  { fieldPattern: 'password', paramName: 'env.EXPENSE_PASSWORD', scope: 'env' },
  { fieldPattern: 'name', taskPattern: 'project.create', paramName: 'input.projectName', scope: 'input' },
  { fieldPattern: 'amount', paramName: 'input.amount', scope: 'input' },
  { fieldPattern: 'category', paramName: 'input.category', scope: 'input' },
  { fieldPattern: 'remark', paramName: 'input.remark', scope: 'input' },
];
