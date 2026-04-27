import type { Transport, BridgeMessage } from '@agent_bridge/protocol';

export class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private destroyed = false;

  connect(peer: InMemoryTransport): void {
    if (this.destroyed) throw new Error('Transport is destroyed');
    this.peer = peer;
  }

  send(message: BridgeMessage): void {
    if (this.destroyed) throw new Error('Transport is destroyed');
    if (!this.peer || this.peer.destroyed) return;
    const target = this.peer;
    queueMicrotask(() => {
      if (target.destroyed) return;
      target.handlers.forEach((h) => h(message));
    });
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  destroy(): void {
    this.destroyed = true;
    this.peer = null;
    this.handlers.clear();
  }
}

export function createMemoryTransportPair(): [InMemoryTransport, InMemoryTransport] {
  const a = new InMemoryTransport();
  const b = new InMemoryTransport();
  a.connect(b);
  b.connect(a);
  return [a, b];
}
