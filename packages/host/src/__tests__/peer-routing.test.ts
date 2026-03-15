// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentBridgeHost } from '../host.js';
import { NAMESPACE } from '@agent_bridge/shared';
import type { BridgeMessage } from '@agent_bridge/shared';

function dispatchBridgeMessage(msg: BridgeMessage): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: 'http://localhost' }));
}

async function mountFakeClient(host: AgentBridgeHost, container: HTMLElement): Promise<{ connectionId: string }> {
  const mountPromise = host.mount(
    { type: 'raw', code: '<p>test</p>', codeType: 'html' },
    { container, handshakeTimeout: 5000 },
  );

  await new Promise((r) => setTimeout(r, 50));

  const posted: any[] = [];
  const frames = container.querySelectorAll('iframe');
  const frame = frames[frames.length - 1];
  const channel = frame.srcdoc.match(/__AGENT_BRIDGE_CHANNEL__="([^"]+)"/)?.[1] ?? '';

  dispatchBridgeMessage({
    type: 'SYN',
    namespace: NAMESPACE,
    channel,
    timestamp: Date.now(),
    participantId: 'aaa-guest',
    protocolVersion: '1.0',
  });

  dispatchBridgeMessage({
    type: 'ACK2',
    namespace: NAMESPACE,
    channel,
    timestamp: Date.now(),
    capabilities: [{ name: 'test', description: 'test action', parameters: { type: 'object', properties: {} } }],
  });

  const conn = await mountPromise;
  return { connectionId: conn.id };
}

describe('Peer Routing', () => {
  let idCounter: number;
  let container: HTMLElement;

  beforeEach(() => {
    idCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${++idCounter}`,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('getConnectedPeers returns connected clients excluding self', async () => {
    const host = new AgentBridgeHost();
    const { connectionId: id1 } = await mountFakeClient(host, container);
    const { connectionId: id2 } = await mountFakeClient(host, container);

    const peersExcluding1 = host.getConnectedPeers(id1);
    expect(peersExcluding1).toHaveLength(1);
    expect(peersExcluding1[0].connectionId).toBe(id2);

    const peersExcluding2 = host.getConnectedPeers(id2);
    expect(peersExcluding2).toHaveLength(1);
    expect(peersExcluding2[0].connectionId).toBe(id1);

    const allPeers = host.getConnectedPeers();
    expect(allPeers).toHaveLength(2);

    host.destroyAll();
  });

  it('routes PEER_MESSAGE from one client to another', async () => {
    const host = new AgentBridgeHost();
    const { connectionId: id1 } = await mountFakeClient(host, container);
    const { connectionId: id2 } = await mountFakeClient(host, container);

    const delivered: any[] = [];
    const conn2 = host.getConnection(id2)!;
    const origSend = conn2['transport']!.send.bind(conn2['transport']!);
    conn2['transport']!.send = (msg: any) => {
      delivered.push(msg);
      origSend(msg);
    };

    dispatchBridgeMessage({
      type: 'PEER_MESSAGE',
      namespace: NAMESPACE,
      channel: id1,
      id: 'pm-1',
      targetConnectionId: id2,
      topic: 'hello',
      payload: { text: 'hi' },
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 10));

    const delivery = delivered.find((m: any) => m.type === 'PEER_MESSAGE_DELIVERY');
    expect(delivery).toBeDefined();
    expect(delivery.fromConnectionId).toBe(id1);
    expect(delivery.topic).toBe('hello');
    expect(delivery.payload).toEqual({ text: 'hi' });

    host.destroyAll();
  });

  it('broadcasts to all clients except sender', async () => {
    const host = new AgentBridgeHost();
    const { connectionId: id1 } = await mountFakeClient(host, container);
    const { connectionId: id2 } = await mountFakeClient(host, container);
    const { connectionId: id3 } = await mountFakeClient(host, container);

    const deliveredTo2: any[] = [];
    const deliveredTo3: any[] = [];

    const conn2 = host.getConnection(id2)!;
    const origSend2 = conn2['transport']!.send.bind(conn2['transport']!);
    conn2['transport']!.send = (msg: any) => { deliveredTo2.push(msg); origSend2(msg); };

    const conn3 = host.getConnection(id3)!;
    const origSend3 = conn3['transport']!.send.bind(conn3['transport']!);
    conn3['transport']!.send = (msg: any) => { deliveredTo3.push(msg); origSend3(msg); };

    dispatchBridgeMessage({
      type: 'BROADCAST',
      namespace: NAMESPACE,
      channel: id1,
      id: 'bc-1',
      topic: 'announce',
      payload: { msg: 'hello all' },
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(deliveredTo2.some((m: any) => m.type === 'PEER_MESSAGE_DELIVERY' && m.topic === 'announce')).toBe(true);
    expect(deliveredTo3.some((m: any) => m.type === 'PEER_MESSAGE_DELIVERY' && m.topic === 'announce')).toBe(true);

    host.destroyAll();
  });

  it('responds to PEER_LIST_REQUEST', async () => {
    const host = new AgentBridgeHost();
    const { connectionId: id1 } = await mountFakeClient(host, container);
    const { connectionId: id2 } = await mountFakeClient(host, container);

    const responses: any[] = [];
    const conn1 = host.getConnection(id1)!;
    const origSend1 = conn1['transport']!.send.bind(conn1['transport']!);
    conn1['transport']!.send = (msg: any) => { responses.push(msg); origSend1(msg); };

    dispatchBridgeMessage({
      type: 'PEER_LIST_REQUEST',
      namespace: NAMESPACE,
      channel: id1,
      id: 'plr-1',
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 10));

    const response = responses.find((m: any) => m.type === 'PEER_LIST_RESPONSE');
    expect(response).toBeDefined();
    expect(response.id).toBe('plr-1');
    expect(response.peers).toHaveLength(1);
    expect(response.peers[0].connectionId).toBe(id2);

    host.destroyAll();
  });
});
