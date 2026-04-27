import { describe, it, expect } from 'vitest';
import { AgentBridgeAgent } from '../agent.js';
import { createMemoryTransportPair } from '@agent_bridge/transport-memory';

describe('AgentBridgeAgent', () => {
  async function connectPair(): Promise<[AgentBridgeAgent, AgentBridgeAgent]> {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);
    // Let capabilities updates propagate
    await new Promise((r) => setTimeout(r, 10));
    return [agentA, agentB];
  }

  it('completes handshake between two agents', async () => {
    const [agentA, agentB] = await connectPair();
    const peersA = agentA.getPeers();
    const peersB = agentB.getPeers();
    expect(peersA).toHaveLength(1);
    expect(peersB).toHaveLength(1);
  });

  it('registers and executes actions', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    agentB.registerAction(
      'greet',
      'Greet someone',
      {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      (params) => ({ message: `Hello, ${params.name}!` }),
    );

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);
    await new Promise((r) => setTimeout(r, 10));

    const [peerB] = agentA.getPeers();
    const result = await agentA.executeAction(peerB.connectionId, 'greet', { name: 'World' });
    expect(result).toEqual({ message: 'Hello, World!' });
  });

  it('returns error for unregistered action', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);

    const [peerB] = agentA.getPeers();
    await expect(
      agentA.executeAction(peerB.connectionId, 'nonexistent', {}),
    ).rejects.toThrow('not registered');
  });

  it('delivers notifications between agents', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    const notifications: any[] = [];
    agentA.on('notification', (_connId, event) => notifications.push(event));

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);
    await new Promise((r) => setTimeout(r, 10));

    agentB.notifyPeers('ready', { timestamp: 12345 }, 'Agent B is ready');
    await new Promise((r) => setTimeout(r, 10));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].eventName).toBe('ready');
    expect(notifications[0].eventData).toEqual({ timestamp: 12345 });
    expect(notifications[0].suggestion).toBe('Agent B is ready');
  });

  it('delivers state sync between agents', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    const snapshots: any[] = [];
    agentA.on('stateSync', (_connId, snap) => snapshots.push(snap));

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);
    await new Promise((r) => setTimeout(r, 10));

    agentB.syncState({ count: 42, status: 'running' });
    await new Promise((r) => setTimeout(r, 10));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual({ count: 42, status: 'running' });
  });

  it('detects peer disconnect', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    const disconnectEvents: any[] = [];
    agentA.on('peerDisconnect', (peer) => disconnectEvents.push(peer));

    const [, connB] = await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);

    connB.destroy();
    await new Promise((r) => setTimeout(r, 20));

    expect(disconnectEvents).toHaveLength(1);
  });

  it('handles action execution error from remote', async () => {
    const [t1, t2] = createMemoryTransportPair();
    const agentA = new AgentBridgeAgent();
    const agentB = new AgentBridgeAgent();

    agentB.registerAction(
      'fail',
      'Always fails',
      { type: 'object', properties: {} },
      () => { throw new Error('Intentional failure'); },
    );

    await Promise.all([
      agentA.acceptConnection(t1),
      agentB.acceptConnection(t2),
    ]);
    await new Promise((r) => setTimeout(r, 10));

    const [peerB] = agentA.getPeers();
    await expect(
      agentA.executeAction(peerB.connectionId, 'fail', {}),
    ).rejects.toThrow('Intentional failure');
  });
});
