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
  outputs: Record<string, unknown>;
};
