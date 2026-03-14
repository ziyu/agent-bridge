import type { MountSource, SandboxConfig } from '@agent-bridge/shared';
import type { Sandbox } from './types.js';

export class IframeSandbox implements Sandbox {
  private iframe: HTMLIFrameElement | null = null;
  private crashHandlers = new Set<(error: Error) => void>();

  mount(source: MountSource & { type: 'uri' }, config: SandboxConfig): HTMLIFrameElement {
    this.iframe = document.createElement('iframe');
    this.iframe.src = source.url;
    this.iframe.setAttribute('sandbox', config.sandbox ?? 'allow-scripts allow-forms');
    if (config.permissions?.length) {
      this.iframe.allow = config.permissions.join('; ');
    }
    this.iframe.style.cssText = 'border:none;width:100%;height:100%';

    this.iframe.addEventListener('error', () => {
      const err = new Error('Sandbox iframe error');
      this.crashHandlers.forEach((h) => h(err));
    });

    config.container.appendChild(this.iframe);
    return this.iframe;
  }

  unmount(): void {
    this.iframe?.remove();
    this.iframe = null;
    this.crashHandlers.clear();
  }

  getContentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null;
  }

  onCrash(callback: (error: Error) => void): () => void {
    this.crashHandlers.add(callback);
    return () => this.crashHandlers.delete(callback);
  }
}
