export type WorkflowTask =
  | {
      task: 'auth.login';
      args: {
        username: string;
        password: string;
      };
    }
  | {
      task: 'project.create';
      args: {
        name: string;
        description?: string;
      };
    }
  | {
      task: 'project.addMembers';
      args: {
        members: string[];
      };
    }
  | {
      task: 'expense.create';
      args: {
        payer: string;
        participants: string[];
        amount: number;
        category: string;
        remark?: string;
      };
    };

export type Workflow = WorkflowTask[];

export const sampleExpenseWorkflow = (suffix = Date.now().toString()): Workflow => [
  {
    task: 'auth.login',
    args: {
      username: 'admin',
      password: 'admin'
    }
  },
  {
    task: 'project.create',
    args: {
      name: `测试自动化项目 ${suffix}`,
      description: '这是测试自动化的项目'
    }
  },
  {
    task: 'project.addMembers',
    args: {
      members: ['自动化1号', '自动化2号', '自动化3号']
    }
  },
  {
    task: 'expense.create',
    args: {
      payer: '自动化1号',
      participants: ['自动化1号', '自动化2号', '自动化3号'],
      amount: 50,
      category: '饮食',
      remark: '111'
    }
  }
];
