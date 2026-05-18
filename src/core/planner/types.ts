export type ArgMeta = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Capability = {
  project: string;
  task: string;
  description: string;
  args: ArgMeta[];
  riskLevel: 'read' | 'write' | 'destructive';
};

export type ProjectAdapter = {
  project: string;
  getCapabilities(): Capability[];
};
