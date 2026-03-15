import type { MountSource, SandboxConfig } from '@agent_bridge/shared';

export interface Sandbox {
  mount(source: MountSource, config: SandboxConfig, connectionId: string): HTMLIFrameElement;
  unmount(): void;
  getContentWindow(): Window | null;
  onCrash(callback: (error: Error) => void): () => void;
}
