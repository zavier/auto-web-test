import { createPlanner, PlannerError } from '../src/planner/planner.js';

// Test 1: Empty input returns empty array
const planner = createPlanner({ openaiApiKey: 'sk-test' });
const result = await planner.plan('');
console.assert(Array.isArray(result) && result.length === 0, 'Empty input should return empty array');

// Test 2: Invalid API key should fail
const badPlanner = createPlanner({ openaiApiKey: 'sk-invalid' });
try {
  await badPlanner.plan('创建一个项目');
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.assert(e instanceof Error, 'Should throw an error');
}

console.log('All planner tests passed');
