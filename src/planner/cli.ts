import { createPlanner } from '../core/planner/planner.js';
import { getCapabilities } from '../core/planner/registry.js';
import { WorkflowSchema, WorkflowTaskSchema } from '../dsl.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let model: string | undefined;
  let input: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (!input) {
      input = args[i];
    }
  }

  if (!input) {
    process.stderr.write(
      'Usage: npx tsx src/planner/cli.ts [--model <model>] "<natural language>"\n'
    );
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('Error: OPENAI_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  const capabilities = getCapabilities(WorkflowTaskSchema, 'expense');
  const planner = createPlanner({ openaiApiKey: apiKey, model }, capabilities, WorkflowSchema);

  try {
    const workflow = await planner.plan(input);
    process.stdout.write(JSON.stringify(workflow, null, 2) + '\n');
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
