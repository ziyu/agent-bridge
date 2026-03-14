import type { MountSource, SandboxConfig } from '@agent-bridge/shared';

export interface Sandbox {
  mount(source: MountSource, config: SandboxConfig): HTMLIFrameElement;
  unmount(): void;
  getContentWindow(): Window | null;
  onCrash(callback: (error: Error) => void): () => void;
}
