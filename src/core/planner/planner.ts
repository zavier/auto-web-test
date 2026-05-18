import OpenAI from 'openai';
import type { ZodType } from 'zod';
import type { Capability } from './types.js';

export class PlannerError extends Error {
  history: { role: string; content: string }[];
  constructor(message: string, history: { role: string; content: string }[]) {
    super(message);
    this.name = 'PlannerError';
    this.history = history;
  }
}

export type PlannerConfig = {
  openaiApiKey: string;
  model?: string;
};

export type Planner = {
  plan(naturalLanguage: string): Promise<unknown[]>;
};

function buildSystemMessage(capabilities: Capability[]): string {
  const taskList = capabilities.map((cap) => {
    const argList = cap.args
      .map((a) => {
        const required = a.required ? '(必填)' : '(可选)';
        return `    - ${a.name}: ${a.type} ${required} — ${a.description}`;
      })
      .join('\n');
    const risk = cap.riskLevel === 'destructive' ? ' [高风险]' : '';
    return `### ${cap.task}${risk}\n${cap.description}\n参数：\n${argList}`;
  }).join('\n\n');

  return `你是 DSL Planner。你的唯一职责是把用户意图转换为 DSL JSON 数组。

## 可用任务

${taskList}

## 规则

1. 只输出 DSL JSON 数组，不要输出额外文字、解释或 markdown
2. 只能使用上面列出的 task，不能编造不存在的 task
3. 理解用户意图后，按合理顺序排列 task（如先登录、再创建项目、再创建费用）
4. 如果用户没有指定某些必填字段，使用合理的默认值
5. 不要输出 Playwright 代码或任何操作浏览器的指令
6. 输出必须是合法的 JSON 数组
7. 对于标记为 [高风险] 的 task，仅在用户明确要求时才使用`;
}

function buildCorrectionPrompt(originalInput: string, parseError: string): string {
  return `用户原始需求：${originalInput}

上一次输出被校验拒绝，错误信息：

${parseError}

请修正你的 DSL JSON 输出，确保：
- task 名是可用任务列表中的其一
- 所有必填字段都已提供
- 字段类型正确（amount 是 number 不是 string，participants 是 array 等）
- 输出是合法的 JSON 数组`;
}

const MAX_RETRIES = 3;

export function createPlanner(
  config: PlannerConfig,
  capabilities: Capability[],
  workflowSchema: ZodType
): Planner {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const model = config.model ?? 'gpt-4o';

  async function callLLM(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): Promise<string> {
    const response = await client.chat.completions.create(
      {
        model,
        messages,
        response_format: { type: 'json_object' },
      },
      { timeout: 30_000 }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new PlannerError('LLM returned empty response', []);
    return content;
  }

  async function plan(naturalLanguage: string): Promise<unknown[]> {
    if (!naturalLanguage.trim()) return [];

    const systemMessage = buildSystemMessage(capabilities);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
    ];

    let currentInput = naturalLanguage;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      messages.push({ role: 'user', content: currentInput });

      const rawOutput = await callLLM(messages);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawOutput);
      } catch {
        currentInput = buildCorrectionPrompt(
          naturalLanguage,
          `输出不是合法的 JSON。原始输出：${rawOutput.slice(0, 500)}`
        );
        continue;
      }

      const candidate = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown>)?.workflow;

      const result = workflowSchema.safeParse(candidate ?? parsed);
      if (result.success) return result.data as unknown[];

      currentInput = buildCorrectionPrompt(naturalLanguage, result.error.message);
    }

    throw new PlannerError(
      `DSL generation failed after ${MAX_RETRIES} attempts`,
      messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
    );
  }

  return { plan };
}
