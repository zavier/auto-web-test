import type { Capability, ProjectAdapter } from './planner/types.js';

export class CapabilityRegistry {
  private adapters = new Map<string, ProjectAdapter>();

  register(adapter: ProjectAdapter): void {
    this.adapters.set(adapter.project, adapter);
  }

  getAllCapabilities(): Capability[] {
    return Array.from(this.adapters.values()).flatMap((a) => a.getCapabilities());
  }

  getAdapter(project: string): ProjectAdapter | undefined {
    return this.adapters.get(project);
  }
}
