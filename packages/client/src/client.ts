import type {
  ActionSchema,
  BridgeMessage,
  CallMessage,
  PeerInfo,
  PeerMessageDelivery,
  PeerChangeNotification,
  PeerListResponse,
} from '@agent_bridge/shared';
import {
  NAMESPACE,
  PROTOCOL_VERSION,
  BridgeError,
  isSynMessage,
  isAck1Message,
  isAck2Message,
  isCallMessage,
  isDestroyMessage,
  isPeerMessageDelivery,
  isPeerChangeNotification,
  isPeerListResponse,
} from '@agent_bridge/shared';
import { OfflineQueue } from './queue.js';
import { ClientTransport } from './transport.js';

interface RegisteredAction {
  schema: ActionSchema;
  callback: (params: Record<string, unknown>) => unknown | Promise<unknown>;
}

export class BridgeClient {
  private transport: ClientTransport | null = null;
  private queue = new OfflineQueue();
  private actions = new Map<string, RegisteredAction>();
  private connected = false;
  private destroyed = false;
  private channel: string;
  private participantId = '';
  private remoteParticipantId = '';
  private peerMessageHandlers = new Set<(msg: { from: string; topic: string; payload: Record<string, unknown> }) => void>();
  private peerChangeHandlers = new Set<(event: 'connected' | 'disconnected', peer: PeerInfo) => void>();
  private pendingPeerListRequests = new Map<string, { resolve: (peers: PeerInfo[]) => void }>();

  constructor(options?: { channel?: string }) {
    this.channel = options?.channel ?? BridgeClient.detectChannel();
  }

  private static detectChannel(): string {
    // 1. Injected global by InlineSandbox
    if (typeof (globalThis as any).__AGENT_BRIDGE_CHANNEL__ === 'string') {
      return (globalThis as any).__AGENT_BRIDGE_CHANNEL__;
    }
    // 2. URL hash by IframeSandbox (survives redirects unlike query params)
    if (typeof location !== 'undefined') {
      try {
        const hash = location.hash?.slice(1);
        if (hash?.startsWith('__bridge_channel__=')) {
          return hash.split('=')[1];
        }
      } catch {
        // ignore
      }
    }
    return 'default';
  }

  async initialize(): Promise<void> {
    if (this.destroyed) throw new BridgeError('CONNECTION_DESTROYED', 'Client has been destroyed');
    if (this.connected) return;

    this.transport = new ClientTransport();
    this.participantId = this.generateId();

    return new Promise<void>((resolve, reject) => {
      const cleanup = this.transport!.onMessage((msg) => {
        if (msg.channel !== this.channel) return;

        if (isSynMessage(msg)) {
          this.remoteParticipantId = msg.participantId;
          this.sendSyn();

          const isLeader = this.participantId > this.remoteParticipantId;
          if (isLeader) {
            this.sendAck1();
          }
        } else if (isAck1Message(msg)) {
          clearInterval(synInterval);
          this.sendAck2();
          this.onConnected();
          cleanup();
          resolve();
        } else if (isAck2Message(msg)) {
          clearInterval(synInterval);
          this.onConnected();
          cleanup();
          resolve();
        }
      });

      this.sendSyn();
      const synInterval = setInterval(() => this.sendSyn(), 100);
    });
  }

  registerAction(
    name: string,
    description: string,
    parameterSchema: ActionSchema['parameters'],
    callback: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void {
    const schema: ActionSchema = { name, description, parameters: parameterSchema };
    this.actions.set(name, { schema, callback });

    if (this.connected && this.transport) {
      this.sendCapabilitiesUpdate();
    }
  }

  notifyHost(
    eventName: string,
    eventData: Record<string, unknown>,
    suggestion?: string,
  ): void {
    const msg: BridgeMessage = {
      type: 'NOTIFY',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
      eventName,
      eventData,
      suggestion,
    };
    this.sendOrQueue(msg);
  }

  syncState(snapshot: Record<string, unknown>): void {
    const msg: BridgeMessage = {
      type: 'STATE_SYNC',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
      snapshot,
    };
    this.sendOrQueue(msg);
  }

  sendToPeer(targetConnectionId: string, topic: string, payload: Record<string, unknown>): void {
    if (!this.connected) throw new BridgeError('NOT_CONNECTED', 'Must be connected to send peer messages');
    this.transport!.send({
      type: 'PEER_MESSAGE',
      namespace: NAMESPACE,
      channel: this.channel,
      id: this.generateId(),
      targetConnectionId,
      topic,
      payload,
      timestamp: Date.now(),
    });
  }

  broadcast(topic: string, payload: Record<string, unknown>): void {
    if (!this.connected) throw new BridgeError('NOT_CONNECTED', 'Must be connected to broadcast');
    this.transport!.send({
      type: 'BROADCAST',
      namespace: NAMESPACE,
      channel: this.channel,
      id: this.generateId(),
      topic,
      payload,
      timestamp: Date.now(),
    });
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

  getPeers(): Promise<PeerInfo[]> {
    if (!this.connected) throw new BridgeError('NOT_CONNECTED', 'Must be connected to get peers');
    const id = this.generateId();
    return new Promise((resolve) => {
      this.pendingPeerListRequests.set(id, { resolve });
      this.transport!.send({
        type: 'PEER_LIST_REQUEST',
        namespace: NAMESPACE,
        channel: this.channel,
        id,
        timestamp: Date.now(),
      });
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;

    if (this.transport) {
      this.transport.send({
        type: 'DESTROY',
        namespace: NAMESPACE,
        channel: this.channel,
        timestamp: Date.now(),
      });
      this.transport.destroy();
      this.transport = null;
    }

    this.actions.clear();
    this.peerMessageHandlers.clear();
    this.peerChangeHandlers.clear();
    this.pendingPeerListRequests.clear();
  }

  private onConnected(): void {
    this.connected = true;
    this.setupRuntimeHandlers();
    this.queue.flush((msg) => this.transport!.send(msg));
    this.sendCapabilitiesUpdate();
  }

  private setupRuntimeHandlers(): void {
    this.transport!.onMessage((msg) => {
      if (msg.channel !== this.channel) return;

      if (isCallMessage(msg)) {
        void this.handleCall(msg);
      } else if (isPeerMessageDelivery(msg)) {
        const delivery = msg as PeerMessageDelivery;
        this.peerMessageHandlers.forEach((h) => h({
          from: delivery.fromConnectionId,
          topic: delivery.topic,
          payload: delivery.payload,
        }));
      } else if (isPeerChangeNotification(msg)) {
        const notification = msg as PeerChangeNotification;
        this.peerChangeHandlers.forEach((h) => h(notification.event, notification.peer));
      } else if (isPeerListResponse(msg)) {
        const response = msg as PeerListResponse;
        const pending = this.pendingPeerListRequests.get(response.id);
        if (pending) {
          this.pendingPeerListRequests.delete(response.id);
          pending.resolve(response.peers);
        }
      } else if (isDestroyMessage(msg)) {
        this.connected = false;
        this.transport?.destroy();
        this.transport = null;
      }
    });
  }

  private async handleCall(msg: CallMessage): Promise<void> {
    const action = this.actions.get(msg.actionName);
    if (!action) {
      this.transport?.send({
        type: 'REPLY',
        namespace: NAMESPACE,
        channel: this.channel,
        timestamp: Date.now(),
        callId: msg.id,
        success: false,
        error: { code: 'ACTION_NOT_FOUND', message: `Action "${msg.actionName}" not registered` },
      });
      return;
    }

    try {
      const value = await action.callback(msg.parameters);
      this.transport?.send({
        type: 'REPLY',
        namespace: NAMESPACE,
        channel: this.channel,
        timestamp: Date.now(),
        callId: msg.id,
        success: true,
        value,
      });
    } catch (err) {
      this.transport?.send({
        type: 'REPLY',
        namespace: NAMESPACE,
        channel: this.channel,
        timestamp: Date.now(),
        callId: msg.id,
        success: false,
        error: {
          code: 'ACTION_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private sendOrQueue(msg: BridgeMessage): void {
    if (this.connected && this.transport) {
      this.transport.send(msg);
    } else {
      this.queue.enqueue(msg);
    }
  }

  private sendSyn(): void {
    this.transport?.sendViaWindow({
      type: 'SYN',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
      participantId: this.participantId,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  private sendAck1(): void {
    this.transport?.sendViaWindow({
      type: 'ACK1',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
    });
  }

  private sendAck2(): void {
    const capabilities = this.getCapabilitiesSnapshot();
    this.transport?.sendViaWindow({
      type: 'ACK2',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
      capabilities,
    });
  }

  private sendCapabilitiesUpdate(): void {
    this.transport?.send({
      type: 'CAPABILITIES_UPDATE',
      namespace: NAMESPACE,
      channel: this.channel,
      timestamp: Date.now(),
      capabilities: this.getCapabilitiesSnapshot(),
    });
  }

  private getCapabilitiesSnapshot(): ActionSchema[] {
    return Array.from(this.actions.values()).map((a) => a.schema);
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
