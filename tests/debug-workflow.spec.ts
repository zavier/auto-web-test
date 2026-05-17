import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { sampleExpenseWorkflow } from '../src/dsl.js';
import { WorkflowExecutor } from '../src/executor.js';

test('debug workflow', async ({ page }) => {
  const workflow = sampleExpenseWorkflow();
  const executor = new WorkflowExecutor(page);
  const result = await executor.run(workflow);
  console.log('=== RESULT ===');
  console.log('success:', result.success);
  console.log('durationMs:', result.durationMs);
  for (const log of result.logs) {
    console.log(`  ${log.task}: ${log.status} ${log.error ?? ''} (${log.durationMs}ms)`);
  }
  console.log('outputs:', JSON.stringify(result.outputs));
  expect(result.success).toBe(true);
});
