import type { BridgeMessage } from '@agent-bridge/shared';

export class OfflineQueue {
  private buffer: BridgeMessage[] = [];
  private flushed = false;

  enqueue(msg: BridgeMessage): void {
    if (this.flushed) return;
    this.buffer.push(msg);
  }

  flush(send: (msg: BridgeMessage) => void): void {
    for (const msg of this.buffer) {
      send(msg);
    }
    this.buffer = [];
    this.flushed = true;
  }

  get size(): number {
    return this.buffer.length;
  }

  get isFlushed(): boolean {
    return this.flushed;
  }
}
