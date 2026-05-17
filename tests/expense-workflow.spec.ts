import 'dotenv/config';
import { test } from '@playwright/test';
import { sampleExpenseWorkflow } from '../src/dsl.js';
import { WorkflowExecutor } from '../src/executor.js';

test('expense workflow can be executed from structured DSL', async ({ page }) => {
  const workflow = sampleExpenseWorkflow();
  const executor = new WorkflowExecutor(page);

  await executor.run(workflow);
});
