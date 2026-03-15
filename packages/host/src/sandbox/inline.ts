import type { MountSource, SandboxConfig } from '@agent-bridge/shared';
import type { Sandbox } from './types.js';

declare const __CLIENT_BUNDLE__: string;

function getInlinedClientBundle(): string {
  if (typeof __CLIENT_BUNDLE__ !== 'undefined') {
    return __CLIENT_BUNDLE__;
  }
  return '';
}

export class InlineSandbox implements Sandbox {
  private iframe: HTMLIFrameElement | null = null;
  private crashHandlers = new Set<(error: Error) => void>();

  mount(source: MountSource & { type: 'raw' }, config: SandboxConfig, connectionId: string): HTMLIFrameElement {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.style.cssText = 'border:none;width:100%;height:100%';

    const html = this.wrapWithClientSDK(source.code, source.codeType ?? 'html', connectionId);
    this.iframe.srcdoc = html;

    this.iframe.addEventListener('error', () => {
      const err = new Error('Sandbox inline iframe error');
      this.crashHandlers.forEach((h) => h(err));
    });

    config.container.appendChild(this.iframe);
    return this.iframe;
  }

  private wrapWithClientSDK(code: string, codeType: 'html' | 'js', connectionId: string): string {
    const clientBundle = getInlinedClientBundle();
    const channelScript = `<script>window.__AGENT_BRIDGE_CHANNEL__="${connectionId}";</script>`;
    const sdkScript = clientBundle ? `${channelScript}<script>${clientBundle}</script>` : channelScript;

    if (codeType === 'html') {
      if (code.includes('</head>')) {
        return code.replace('</head>', `${sdkScript}\n</head>`);
      }
      return `<!DOCTYPE html><html><head>${sdkScript}</head><body>${code}</body></html>`;
    }

    return `<!DOCTYPE html><html><head>${sdkScript}</head><body><script>${code}</script></body></html>`;
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
