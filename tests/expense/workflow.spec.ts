import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { sampleExpenseWorkflow } from '../../src/dsl.js';
import { WorkflowExecutor } from '../../src/executor.js';

test('expense workflow can be executed from structured DSL', async ({ page }) => {
  const workflow = sampleExpenseWorkflow();
  const executor = new WorkflowExecutor(page);

  const result = await executor.run(workflow);

  if (!result.success) {
    console.error('Workflow failed:', JSON.stringify(result.logs, null, 2));
  }
  expect(result.success).toBe(true);
  expect(result.outputs.projectId).toBeDefined();
  expect(result.outputs.projectName).toBeDefined();
  expect(result.logs).toHaveLength(3);
  expect(result.logs[0].task).toBe('auth.login');
  expect(result.logs[0].status).toBe('success');
  expect(result.logs[0].durationMs).toBeDefined();
  expect(result.logs[1].task).toBe('project.create');
  expect(result.logs[1].status).toBe('success');
  expect(result.logs[1].output).toBeDefined();
  expect(result.logs[2].task).toBe('expense.create');
  expect(result.logs[2].status).toBe('success');
});
