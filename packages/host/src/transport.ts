import type { BridgeMessage } from '@agent-bridge/shared';
import { isValidBridgeMessage } from '@agent-bridge/shared';

export class HostTransport {
  private port: MessagePort | null = null;
  private pendingPort: MessagePort | null = null;
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private windowHandler: ((e: MessageEvent) => void) | null = null;
  private targetWindow: Window;
  private allowedOrigins: (string | RegExp)[];
  private concreteOrigin: string | null = null;

  constructor(targetWindow: Window, allowedOrigins: (string | RegExp)[] = ['*']) {
    this.targetWindow = targetWindow;
    this.allowedOrigins = allowedOrigins;

    this.windowHandler = (e: MessageEvent) => {
      if (!this.isAllowedOrigin(e.origin)) return;
      if (!isValidBridgeMessage(e.data)) return;

      if ((e.data as BridgeMessage).type === 'SYN' && !this.concreteOrigin) {
        this.concreteOrigin = e.origin === 'null' ? '*' : e.origin;
      }

      this.handlers.forEach((h) => h(e.data as BridgeMessage));
    };
    window.addEventListener('message', this.windowHandler);
  }

  createMessageChannel(): MessagePort {
    const { port1, port2 } = new MessageChannel();
    this.pendingPort = port1;
    return port2;
  }

  activateMessageChannel(): void {
    if (!this.pendingPort) return;
    this.port = this.pendingPort;
    this.pendingPort = null;
    this.port.addEventListener('message', (e: MessageEvent) => {
      if (!isValidBridgeMessage(e.data)) return;
      this.handlers.forEach((h) => h(e.data as BridgeMessage));
    });
    this.port.start();

    if (this.windowHandler) {
      window.removeEventListener('message', this.windowHandler);
      this.windowHandler = null;
    }
  }

  getTargetOrigin(): string {
    return this.concreteOrigin ?? '*';
  }

  sendViaWindow(message: BridgeMessage, origin: string, transferables?: Transferable[]): void {
    this.targetWindow.postMessage(message, origin, transferables ?? []);
  }

  send(message: BridgeMessage, transferables?: Transferable[]): void {
    if (this.port) {
      this.port.postMessage(message, { transfer: transferables ?? [] });
    } else {
      const origin = message.type === 'SYN' ? '*' : (this.concreteOrigin ?? '*');
      this.targetWindow.postMessage(message, origin, transferables ?? []);
    }
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.allowedOrigins.some((allowed) =>
      allowed instanceof RegExp
        ? allowed.test(origin)
        : allowed === origin || allowed === '*',
    );
  }

  destroy(): void {
    if (this.windowHandler) {
      window.removeEventListener('message', this.windowHandler);
      this.windowHandler = null;
    }
    this.port?.close();
    this.port = null;
    this.handlers.clear();
  }
}
