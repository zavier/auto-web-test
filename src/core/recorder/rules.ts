export type ParameterizeRule = {
  fieldPattern: string | RegExp;
  taskPattern?: string | RegExp;
  paramName: string;
  scope: 'env' | 'input' | 'global';
};
