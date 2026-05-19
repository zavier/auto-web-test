import { describe, test, expect, vi } from 'vitest';
import { createPlanner, PlannerError } from '../../src/core/planner/planner.js';
import { getCapabilities } from '../../src/core/planner/registry.js';
import { WorkflowSchema, WorkflowTaskSchema } from '../../src/projects/expense/tasks.js';

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({ choices: [] }),
      },
    };
  },
}));

describe('LLM Planner', () => {
  const capabilities = getCapabilities(WorkflowTaskSchema, 'expense');

  test('empty input returns empty array', async () => {
    const planner = createPlanner({ openaiApiKey: 'sk-test' }, capabilities, WorkflowSchema);
    const result = await planner.plan('');
    expect(result).toEqual([]);
  });

  test('empty LLM response throws PlannerError', async () => {
    const planner = createPlanner({ openaiApiKey: 'sk-test' }, capabilities, WorkflowSchema);
    await expect(planner.plan('创建一个项目')).rejects.toThrow(PlannerError);
  });
});
