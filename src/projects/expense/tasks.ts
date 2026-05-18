import { z } from 'zod';

const AuthLoginTask = z.object({
  task: z.literal('auth.login').describe('登录费用管理系统'),
  args: z.object({
    username: z.string().min(1).describe('登录用户名'),
    password: z.string().min(1).describe('登录密码'),
  }),
});

const ProjectCreateTask = z.object({
  task: z.literal('project.create').describe('创建费用分摊项目'),
  args: z.object({
    name: z.string().min(1).describe('项目名称'),
    description: z.string().optional().describe('项目描述'),
    members: z.array(z.string().min(1)).optional().describe('项目成员姓名列表'),
  }),
});

const ProjectAddMembersTask = z.object({
  task: z.literal('project.addMembers').describe('向项目添加成员'),
  args: z.object({
    members: z.array(z.string().min(1)).describe('要添加的成员姓名列表'),
  }),
});

const ExpenseCreateTask = z.object({
  task: z.literal('expense.create').describe('在项目中创建一笔费用记录'),
  args: z.object({
    payer: z.string().min(1).describe('支付人姓名'),
    participants: z.array(z.string().min(1)).min(1).describe('参与分摊的人员姓名列表'),
    amount: z.number().positive().describe('费用金额（元）'),
    category: z.string().min(1).describe('费用类别，如：饮食、交通、住宿、办公'),
    remark: z.string().optional().describe('备注说明'),
  }),
});

export const WorkflowTaskSchema = z.union([
  AuthLoginTask,
  ProjectCreateTask,
  ProjectAddMembersTask,
  ExpenseCreateTask,
]);

export const WorkflowSchema = z.array(WorkflowTaskSchema);

export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
