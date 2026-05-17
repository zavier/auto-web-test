import { z } from 'zod';

const AuthLoginTask = z.object({
  task: z.literal('auth.login'),
  args: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});

const ProjectCreateTask = z.object({
  task: z.literal('project.create'),
  args: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    members: z.array(z.string().min(1)).optional(),
  }),
});

const ProjectAddMembersTask = z.object({
  task: z.literal('project.addMembers'),
  args: z.object({
    members: z.array(z.string().min(1)),
  }),
});

const ExpenseCreateTask = z.object({
  task: z.literal('expense.create'),
  args: z.object({
    payer: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1),
    amount: z.number().positive(),
    category: z.string().min(1),
    remark: z.string().optional(),
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

export type TaskOutput = Record<string, unknown> | undefined;

export type TaskLog = {
  task: string;
  status: 'started' | 'success' | 'failed';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  output?: TaskOutput;
  error?: string;
};

export type WorkflowResult = {
  success: boolean;
  durationMs: number;
  logs: TaskLog[];
  outputs: {
    projectId?: number;
    projectName?: string;
  };
};

export const sampleExpenseWorkflow = (suffix = Date.now().toString()): Workflow => [
  {
    task: 'auth.login',
    args: {
      username: process.env.EXPENSE_USERNAME ?? '',
      password: process.env.EXPENSE_PASSWORD ?? '',
    },
  },
  {
    task: 'project.create',
    args: {
      name: `测试自动化项目 ${suffix}`,
      description: '这是测试自动化的项目',
    },
  },
  {
    task: 'project.addMembers',
    args: {
      members: ['自动化1号', '自动化2号', '自动化3号'],
    },
  },
  {
    task: 'expense.create',
    args: {
      payer: '自动化1号',
      participants: ['自动化1号', '自动化2号', '自动化3号'],
      amount: 50,
      category: '饮食',
      remark: '111',
    },
  },
];
