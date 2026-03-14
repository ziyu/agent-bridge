// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection } from '../connection.js';
import type { Sandbox } from '../sandbox/types.js';
import { NAMESPACE } from '@agent-bridge/shared';
import type { BridgeMessage } from '@agent-bridge/shared';

function createMockSandbox(): Sandbox {
  return {
    mount: vi.fn(),
    unmount: vi.fn(),
    getContentWindow: vi.fn(() => null),
    onCrash: vi.fn(() => () => {}),
  };
}

function dispatchBridgeMessage(msg: BridgeMessage): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: 'http://localhost' }));
}

describe('Connection', () => {
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${++idCounter}`,
    });
  });

  it('starts in disconnected state', () => {
    const conn = new Connection('conn-1', createMockSandbox());
    expect(conn.getState()).toBe('disconnected');
    expect(conn.getCapabilities()).toEqual([]);
  });

  it('emits stateChange events', () => {
    const conn = new Connection('conn-1', createMockSandbox());
    const events: any[] = [];
    conn.on('stateChange', (e) => events.push(e));
    conn.destroy();
    expect(events.length).toBe(0);
  });

  it('destroy cleans up sandbox', () => {
    const sandbox = createMockSandbox();
    const conn = new Connection('conn-1', sandbox);
    conn.destroy();
    expect(sandbox.unmount).toHaveBeenCalled();
  });

  it('rejects executeAction when not connected', async () => {
    const conn = new Connection('conn-1', createMockSandbox());
    await expect(conn.executeAction('test', {})).rejects.toThrow('not connected');
  });

  it('completes handshake when guest SYN arrives (host is non-leader)', async () => {
    const sandbox = createMockSandbox();
    const conn = new Connection('conn-1', sandbox);
    const stateChanges: any[] = [];
    conn.on('stateChange', (e) => stateChanges.push(e));

    const mockTargetWindow = { postMessage: vi.fn() } as any;
    const handshakePromise = conn.handshake(mockTargetWindow, ['*'], 5000);

    dispatchBridgeMessage({
      type: 'SYN',
      namespace: NAMESPACE,
      channel: 'conn-1',
      timestamp: Date.now(),
      participantId: 'zzz-guest-id',
      protocolVersion: '1.0',
    });

    dispatchBridgeMessage({
      type: 'ACK1',
      namespace: NAMESPACE,
      channel: 'conn-1',
      timestamp: Date.now(),
    });

    await handshakePromise;
    expect(conn.getState()).toBe('connected');
    expect(stateChanges.some((e: any) => e.current === 'connected')).toBe(true);
    expect(conn.getCapabilities()).toHaveLength(0);

    conn.destroy();
  });

  it('receives capabilities from ACK2 when host is leader', async () => {
    const sandbox = createMockSandbox();
    const conn = new Connection('conn-1', sandbox);
    const capEvents: any[] = [];
    conn.on('capabilities', (caps) => capEvents.push(caps));

    const mockTargetWindow = { postMessage: vi.fn() } as any;
    const handshakePromise = conn.handshake(mockTargetWindow, ['*'], 5000);

    dispatchBridgeMessage({
      type: 'SYN',
      namespace: NAMESPACE,
      channel: 'conn-1',
      timestamp: Date.now(),
      participantId: 'aaa-guest-id',
      protocolVersion: '1.0',
    });

    dispatchBridgeMessage({
      type: 'ACK2',
      namespace: NAMESPACE,
      channel: 'conn-1',
      timestamp: Date.now(),
      capabilities: [{ name: 'test_action', description: 'A test', parameters: { type: 'object', properties: {} } }],
    });

    await handshakePromise;
    expect(conn.getState()).toBe('connected');
    expect(conn.getCapabilities()).toHaveLength(1);
    expect(conn.getCapabilities()[0].name).toBe('test_action');
    expect(capEvents).toHaveLength(1);

    conn.destroy();
  });

  it('times out handshake', async () => {
    vi.useFakeTimers();
    const sandbox = createMockSandbox();
    const conn = new Connection('conn-1', sandbox);

    const mockTargetWindow = { postMessage: vi.fn() } as any;
    const promise = conn.handshake(mockTargetWindow, ['*'], 100);

    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow('timed out');
    expect(conn.getState()).toBe('error');

    vi.useRealTimers();
    conn.destroy();
  });
});
