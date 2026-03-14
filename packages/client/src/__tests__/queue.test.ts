import { describe, it, expect } from 'vitest';
import { OfflineQueue } from '../queue.js';
import { NAMESPACE } from '@agent-bridge/shared';
import type { BridgeMessage } from '@agent-bridge/shared';

const makeMsg = (type: string): BridgeMessage =>
  ({ namespace: NAMESPACE, channel: 'test', timestamp: Date.now(), type } as any);

describe('OfflineQueue', () => {
  it('enqueues and flushes messages in order', () => {
    const queue = new OfflineQueue();
    const m1 = makeMsg('NOTIFY');
    const m2 = makeMsg('STATE_SYNC');
    queue.enqueue(m1);
    queue.enqueue(m2);
    expect(queue.size).toBe(2);

    const flushed: BridgeMessage[] = [];
    queue.flush((msg) => flushed.push(msg));

    expect(flushed).toEqual([m1, m2]);
    expect(queue.size).toBe(0);
    expect(queue.isFlushed).toBe(true);
  });

  it('silently ignores enqueue after flush', () => {
    const queue = new OfflineQueue();
    queue.flush(() => {});
    queue.enqueue(makeMsg('NOTIFY'));
    expect(queue.size).toBe(0);
  });
});
