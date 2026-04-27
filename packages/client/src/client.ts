import type {
  ActionSchema,
  PeerInfo,
} from '@agent_bridge/shared';
import { BridgeError } from '@agent_bridge/shared';
import { AgentBridgeAgent } from '@agent_bridge/agent';
import { ClientTransport } from './transport.js';

export class BridgeClient {
  private agent: AgentBridgeAgent;
  private transport: ClientTransport | null = null;
  private connected = false;
  private destroyed = false;
  private channel: string;
  private peerMessageHandlers = new Set<(msg: { from: string; topic: string; payload: Record<string, unknown> }) => void>();
  private peerChangeHandlers = new Set<(event: 'connected' | 'disconnected', peer: PeerInfo) => void>();

  constructor(options?: { channel?: string }) {
    this.channel = options?.channel ?? BridgeClient.detectChannel();
    this.agent = new AgentBridgeAgent({ name: 'BridgeClient' });
  }

  private static detectChannel(): string {
    if (typeof (globalThis as any).__AGENT_BRIDGE_CHANNEL__ === 'string') {
      return (globalThis as any).__AGENT_BRIDGE_CHANNEL__;
    }
    if (typeof location !== 'undefined') {
      try {
        const hash = location.hash?.slice(1);
        if (hash?.startsWith('__bridge_channel__=')) {
          return hash.split('=')[1];
        }
      } catch { /* ignore */ }
    }
    return 'default';
  }

  async initialize(): Promise<void> {
    if (this.destroyed) throw new BridgeError('CONNECTION_DESTROYED', 'Client has been destroyed');
    if (this.connected) return;

    this.transport = new ClientTransport();

    this.agent.on('peerConnect', (peer) => {
      this.peerChangeHandlers.forEach((h) => h('connected', peer));
    });

    this.agent.on('peerDisconnect', (peer) => {
      this.peerChangeHandlers.forEach((h) => h('disconnected', peer));
    });

    try {
      await this.agent.acceptConnection(this.transport);
    } catch (err) {
      throw err;
    }

    this.connected = true;
  }

  registerAction(
    name: string,
    description: string,
    parameterSchema: ActionSchema['parameters'],
    callback: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void {
    this.agent.registerAction(name, description, parameterSchema, callback);
  }

  notifyHost(eventName: string, eventData: Record<string, unknown>, suggestion?: string): void {
    this.agent.notifyPeers(eventName, eventData, suggestion);
  }

  syncState(snapshot: Record<string, unknown>): void {
    this.agent.syncState(snapshot);
  }

  sendToPeer(targetConnectionId: string, topic: string, payload: Record<string, unknown>): void {
    if (!this.connected) throw new BridgeError('NOT_CONNECTED', 'Must be connected to send peer messages');
    this.agent.sendToPeer(targetConnectionId, topic, payload);
  }

  broadcast(topic: string, payload: Record<string, unknown>): void {
    if (!this.connected) throw new BridgeError('NOT_CONNECTED', 'Must be connected to broadcast');
    this.agent.broadcast(topic, payload);
  }

  onPeerMessage(handler: (msg: { from: string; topic: string; payload: Record<string, unknown> }) => void): () => void;
  onPeerMessage(topic: string, handler: (msg: { from: string; payload: Record<string, unknown> }) => void): () => void;
  onPeerMessage(
    topicOrHandler: string | ((msg: { from: string; topic: string; payload: Record<string, unknown> }) => void),
    maybeHandler?: (msg: { from: string; payload: Record<string, unknown> }) => void,
  ): () => void {
    if (typeof topicOrHandler === 'function') {
      this.peerMessageHandlers.add(topicOrHandler);
      return () => this.peerMessageHandlers.delete(topicOrHandler);
    }
    const topic = topicOrHandler;
    const wrapped = (msg: { from: string; topic: string; payload: Record<string, unknown> }) => {
      if (msg.topic === topic) maybeHandler!(msg);
    };
    this.peerMessageHandlers.add(wrapped);
    return () => this.peerMessageHandlers.delete(wrapped);
  }

  onPeerChange(handler: (event: 'connected' | 'disconnected', peer: PeerInfo) => void): () => void {
    this.peerChangeHandlers.add(handler);
    return () => this.peerChangeHandlers.delete(handler);
  }

  getPeers(): PeerInfo[] {
    if (!this.connected) return [];
    return this.agent.getPeers();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    this.agent.destroy();
    this.transport?.destroy();
    this.transport = null;
    this.peerMessageHandlers.clear();
    this.peerChangeHandlers.clear();
  }
}
