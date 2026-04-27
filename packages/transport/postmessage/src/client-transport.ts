import type { BridgeMessage, Transport } from '@agent_bridge/protocol';
import { isValidBridgeMessage } from '@agent_bridge/protocol';

export class ClientPostMessageTransport implements Transport {
  private port: MessagePort | null = null;
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private windowHandler: ((e: MessageEvent) => void) | null = null;

  constructor() {
    this.windowHandler = (e: MessageEvent) => {
      if (!isValidBridgeMessage(e.data)) return;
      if (e.ports?.length > 0 && !this.port) {
        this.upgradeToPort(e.ports[0]);
      }
      this.handlers.forEach((h) => h(e.data as BridgeMessage));
    };
    window.addEventListener('message', this.windowHandler);
  }

  sendViaWindow(message: BridgeMessage): void {
    window.parent.postMessage(message, '*');
  }

  upgradeToPort(port: MessagePort): void {
    this.port = port;
    port.addEventListener('message', (e: MessageEvent) => {
      if (!isValidBridgeMessage(e.data)) return;
      this.handlers.forEach((h) => h(e.data as BridgeMessage));
    });
    port.start();

    if (this.windowHandler) {
      window.removeEventListener('message', this.windowHandler);
      this.windowHandler = null;
    }
  }

  send(message: BridgeMessage): void {
    if (this.port) {
      this.port.postMessage(message);
    } else {
      this.sendViaWindow(message);
    }
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
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
