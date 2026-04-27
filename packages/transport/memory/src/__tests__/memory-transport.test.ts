import { describe, it, expect } from 'vitest';
import { InMemoryTransport, createMemoryTransportPair } from '../index.js';
import { NAMESPACE, isValidBridgeMessage } from '@agent_bridge/protocol';

describe('InMemoryTransport', () => {
  it('delivers messages from A to B', async () => {
    const [a, b] = createMemoryTransportPair();
    const received: unknown[] = [];

    b.onMessage((msg) => received.push(msg));

    const syn: any = {
      namespace: NAMESPACE,
      channel: 'test',
      timestamp: Date.now(),
      type: 'SYN',
      participantId: 'a',
      protocolVersion: '1.0',
    };

    a.send(syn);
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(isValidBridgeMessage(received[0])).toBe(true);
    expect((received[0] as any).type).toBe('SYN');
  });

  it('delivers messages from B to A', async () => {
    const [a, b] = createMemoryTransportPair();
    const received: unknown[] = [];

    a.onMessage((msg) => received.push(msg));

    b.send({
      namespace: NAMESPACE,
      channel: 'test',
      timestamp: Date.now(),
      type: 'ACK1',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe('ACK1');
  });

  it('unsubscribes via returned cleanup function', async () => {
    const [a, b] = createMemoryTransportPair();
    const received: unknown[] = [];

    const unsub = a.onMessage((msg) => received.push(msg));
    unsub();

    b.send({
      namespace: NAMESPACE,
      channel: 'test',
      timestamp: Date.now(),
      type: 'SYN',
      participantId: 'x',
      protocolVersion: '1.0',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(0);
  });

  it('ignores sends to destroyed peer', async () => {
    const [a, b] = createMemoryTransportPair();
    const received: unknown[] = [];

    b.onMessage((msg) => received.push(msg));
    b.destroy();

    a.send({
      namespace: NAMESPACE,
      channel: 'test',
      timestamp: Date.now(),
      type: 'SYN',
      participantId: 'a',
      protocolVersion: '1.0',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(0);
  });

  it('throws on send after destroy', () => {
    const [a] = createMemoryTransportPair();
    a.destroy();
    expect(() => a.send({
      namespace: NAMESPACE,
      channel: 'test',
      timestamp: Date.now(),
      type: 'SYN',
      participantId: 'id',
      protocolVersion: '1.0',
    })).toThrow('destroyed');
  });
});
