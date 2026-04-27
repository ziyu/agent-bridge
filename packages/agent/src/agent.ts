import type {
  Transport,
  ConnectableTransport,
  ListenableTransport,
  ActionSchema,
  NotificationEvent,
  PeerInfo,
  AgentIdentityPayload,
} from '@agent_bridge/protocol';
import { BridgeError, NAMESPACE, isCallMessage } from '@agent_bridge/protocol';
import { PeerConnection } from './connection.js';

type RegisteredAction = {
  schema: ActionSchema;
  callback: (params: Record<string, unknown>) => unknown | Promise<unknown>;
};

type ConnectionEvents = {
  stateChange: (connectionId: string, previous: string, current: string) => void;
  capabilities: (connectionId: string, capabilities: ActionSchema[]) => void;
  notification: (connectionId: string, event: NotificationEvent) => void;
  stateSync: (connectionId: string, snapshot: Record<string, unknown>) => void;
  peerConnect: (peer: PeerInfo) => void;
  peerDisconnect: (peer: PeerInfo) => void;
};

export class AgentBridgeAgent {
  private actions = new Map<string, RegisteredAction>();
  private connections = new Map<string, PeerConnection>();
  private participantId: string;
  private identity: AgentIdentityPayload;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private destroyed = false;

  constructor(options?: { participantId?: string; name?: string; transports?: string[] }) {
    this.participantId = options?.participantId ?? this.generateId();
    this.identity = {
      name: options?.name ?? 'AgentBridgeAgent',
      transports: options?.transports ?? [],
    };
  }

  registerAction(
    name: string,
    description: string,
    parameterSchema: ActionSchema['parameters'],
    callback: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void {
    this.actions.set(name, {
      schema: { name, description, parameters: parameterSchema },
      callback,
    });

    for (const [, conn] of this.connections) {
      if (conn.getState() === 'connected') {
        this.sendCapabilitiesUpdate(conn);
      }
    }
  }

  async connect(transport: ConnectableTransport, address: string, options?: { timeout?: number }): Promise<PeerConnection> {
    if (this.destroyed) throw new BridgeError('CONNECTION_DESTROYED', 'Agent has been destroyed');
    await transport.connect(address);
    return this.attachConnection(transport, options?.timeout);
  }

  async acceptConnection(transport: Transport, options?: { timeout?: number }): Promise<PeerConnection> {
    if (this.destroyed) throw new BridgeError('CONNECTION_DESTROYED', 'Agent has been destroyed');
    return this.attachConnection(transport, options?.timeout);
  }

  async listen(
    transport: ListenableTransport,
    address: string,
    options?: { timeout?: number },
  ): Promise<void> {
    if (this.destroyed) throw new BridgeError('CONNECTION_DESTROYED', 'Agent has been destroyed');

    await transport.listen(address, async (childTransport: Transport) => {
      if (this.destroyed) {
        childTransport.destroy();
        return;
      }
      try {
        await this.attachConnection(childTransport, options?.timeout);
      } catch {
        childTransport.destroy();
      }
    });
  }

  async executeAction(
    connectionId: string,
    actionName: string,
    parameters: Record<string, unknown>,
    options?: { timeout?: number },
  ): Promise<unknown> {
    const conn = this.connections.get(connectionId);
    if (!conn) throw new BridgeError('NOT_CONNECTED', `Connection "${connectionId}" not found`);
    return conn.executeAction(actionName, parameters, options?.timeout);
  }

  notifyPeers(eventName: string, eventData: Record<string, unknown>, suggestion?: string): void {
    for (const [, conn] of this.connections) {
      if (conn.getState() === 'connected') {
        conn.send({
          type: 'NOTIFY',
          namespace: NAMESPACE,
          channel: conn.id,
          timestamp: Date.now(),
          eventName,
          eventData,
          suggestion,
        });
      }
    }
  }

  syncState(snapshot: Record<string, unknown>): void {
    for (const [, conn] of this.connections) {
      if (conn.getState() === 'connected') {
        conn.send({
          type: 'STATE_SYNC',
          namespace: NAMESPACE,
          channel: conn.id,
          timestamp: Date.now(),
          snapshot,
        });
      }
    }
  }

  sendToPeer(connectionId: string, topic: string, payload: Record<string, unknown>): void {
    const conn = this.connections.get(connectionId);
    if (!conn) throw new BridgeError('NOT_CONNECTED', `Peer "${connectionId}" not found`);
    conn.send({
      type: 'PEER_MESSAGE_DELIVERY',
      namespace: NAMESPACE,
      channel: conn.id,
      id: this.generateId(),
      fromConnectionId: this.participantId,
      topic,
      payload,
      timestamp: Date.now(),
    });
  }

  broadcast(topic: string, payload: Record<string, unknown>): void {
    for (const [, conn] of this.connections) {
      if (conn.getState() === 'connected') {
        conn.send({
          type: 'PEER_MESSAGE_DELIVERY',
          namespace: NAMESPACE,
          channel: conn.id,
          id: this.generateId(),
          fromConnectionId: this.participantId,
          topic,
          payload,
          timestamp: Date.now(),
        });
      }
    }
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.getState() === 'connected')
      .map(([id, conn]) => ({
        connectionId: id,
        capabilities: conn.getCapabilities(),
      }));
  }

  getAllCapabilities(): { connectionId: string; capabilities: ActionSchema[] }[] {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      connectionId: id,
      capabilities: conn.getCapabilities(),
    }));
  }

  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlerSet = this.listeners.get(event)!;
    const h = handler as (...args: any[]) => void;
    handlerSet.add(h);
    return () => handlerSet.delete(h);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [, conn] of this.connections) {
      conn.destroy();
    }
    this.connections.clear();
    this.actions.clear();
    this.listeners.clear();
  }

  private async attachConnection(transport: Transport, timeout?: number): Promise<PeerConnection> {
    const connectionId = this.generateId();
    const conn = new PeerConnection(
      connectionId,
      transport,
      this.participantId,
      () => this.getCapabilitiesSnapshot(),
    );

    this.connections.set(connectionId, conn);

    conn.on('stateChange', (evt) => {
      this.emit('stateChange', connectionId, evt.previous, evt.current);
      if (evt.current === 'disconnected' || evt.current === 'error') {
        this.connections.delete(connectionId);
        this.emit('peerDisconnect', { connectionId, capabilities: [] });
      }
    });

    conn.on('capabilities', (caps) => {
      this.emit('capabilities', connectionId, caps);
    });

    conn.on('notification', (evt) => {
      this.emit('notification', connectionId, evt);
    });

    conn.on('stateSync', (snap) => {
      this.emit('stateSync', connectionId, snap);
    });

    try {
      await conn.connect({ timeout, identity: this.identity });

      transport.onMessage(async (msg) => {
        if (!isCallMessage(msg)) return;
        const action = this.actions.get(msg.actionName);
        if (!action) {
          transport.send({
            type: 'REPLY', namespace: NAMESPACE, channel: conn.id,
            timestamp: Date.now(), callId: msg.id, success: false,
            error: { code: 'ACTION_NOT_FOUND', message: `Action "${msg.actionName}" not registered` },
          });
          return;
        }
        try {
          const value = await action.callback(msg.parameters);
          transport.send({
            type: 'REPLY', namespace: NAMESPACE, channel: conn.id,
            timestamp: Date.now(), callId: msg.id, success: true, value,
          });
        } catch (err) {
          transport.send({
            type: 'REPLY', namespace: NAMESPACE, channel: conn.id,
            timestamp: Date.now(), callId: msg.id, success: false,
            error: { code: 'ACTION_EXECUTION_ERROR', message: err instanceof Error ? err.message : String(err) },
          });
        }
      });

      this.emit('peerConnect', {
        connectionId,
        capabilities: conn.getCapabilities(),
      });
      this.sendCapabilitiesUpdate(conn);
    } catch (err) {
      this.connections.delete(connectionId);
      conn.destroy();
      throw err;
    }

    return conn;
  }

  private sendCapabilitiesUpdate(conn: PeerConnection): void {
    conn.send({
      type: 'CAPABILITIES_UPDATE',
      namespace: NAMESPACE,
      channel: conn.id,
      timestamp: Date.now(),
      capabilities: this.getCapabilitiesSnapshot(),
    });
  }

  private getCapabilitiesSnapshot(): ActionSchema[] {
    return Array.from(this.actions.values()).map((a) => a.schema);
  }

  private emit<K extends keyof ConnectionEvents>(event: K, ...args: any[]): void {
    this.listeners.get(event)?.forEach((h) => h(...args));
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
