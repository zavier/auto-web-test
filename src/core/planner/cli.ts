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
      'Usage: npx tsx src/core/planner/cli.ts [--model <model>] "<natural language>"\n'
    );
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('Error: OPENAI_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  process.stderr.write('Note: This is the generic planner CLI. Use project-specific CLI for actual planning.\n');
  process.exit(0);
}

main();
