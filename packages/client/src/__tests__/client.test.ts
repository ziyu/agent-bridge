// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BridgeClient } from '../client.js';
import { NAMESPACE } from '@agent-bridge/shared';

describe('BridgeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'client-uuid-1' });
  });

  it('registers actions before initialize', () => {
    const client = new BridgeClient({ channel: 'ch1' });
    client.registerAction('test_action', 'A test', {
      type: 'object',
      properties: { x: { type: 'string' } },
    }, () => 'ok');

    expect(() => client.destroy()).not.toThrow();
  });

  it('queues notifications before connection', () => {
    const client = new BridgeClient({ channel: 'ch1' });
    client.notifyHost('click', { target: 'btn' });
    client.syncState({ count: 1 });
    client.destroy();
  });

  it('throws on initialize after destroy', async () => {
    const client = new BridgeClient();
    client.destroy();
    await expect(client.initialize()).rejects.toThrow('destroyed');
  });

  it('sends SYN on initialize', async () => {
    const posted: any[] = [];

    Object.defineProperty(window, 'parent', {
      value: {
        postMessage: (msg: any, _origin: any) => posted.push(msg),
      },
      writable: true,
      configurable: true,
    });

    const client = new BridgeClient({ channel: 'default' });
    const initPromise = client.initialize();

    await new Promise((r) => setTimeout(r, 10));

    expect(posted.length).toBeGreaterThanOrEqual(1);
    const syn = posted.find((m: any) => m.type === 'SYN');
    expect(syn).toBeDefined();
    expect(syn.namespace).toBe(NAMESPACE);
    expect(syn.participantId).toBe('client-uuid-1');

    client.destroy();
  });
});
