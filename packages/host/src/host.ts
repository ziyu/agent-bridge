import type {
  ActionSchema,
  MountSource,
  SandboxConfig,
  NotificationEvent,
  PeerInfo,
} from '@agent_bridge/shared';
import { DEFAULT_HANDSHAKE_TIMEOUT, NAMESPACE } from '@agent_bridge/shared';
import { Connection } from './connection.js';
import { IframeSandbox } from './sandbox/iframe.js';
import { InlineSandbox } from './sandbox/inline.js';

export class AgentBridgeHost {
  private connections = new Map<string, Connection>();

  async mount(source: MountSource, config: SandboxConfig): Promise<Connection> {
    const sandbox = source.type === 'uri' ? new IframeSandbox() : new InlineSandbox();
    const connectionId = this.generateId();
    const connection = new Connection(connectionId, sandbox);

    sandbox.mount(source as any, config, connectionId);

    const targetWindow = sandbox.getContentWindow();
    if (!targetWindow) {
      sandbox.unmount();
      throw new Error('Failed to get sandbox content window');
    }

    sandbox.onCrash((err) => {
      connection.destroy();
    });

    this.connections.set(connectionId, connection);

    try {
      await connection.handshake(
        targetWindow,
        config.allowedOrigins ?? ['*'],
        config.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT,
      );
    } catch (err) {
      this.connections.delete(connectionId);
      sandbox.unmount();
      throw err;
    }

    this.setupPeerRouting(connectionId, connection);
    this.notifyPeerChange('connected', connectionId);

    return connection;
  }

  unmount(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(connectionId);
    this.notifyPeerChange('disconnected', connectionId);
  }

  async executeAction(
    connectionId: string,
    actionName: string,
    parameters: Record<string, unknown>,
    options?: { timeout?: number },
  ): Promise<unknown> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      throw new Error(`Connection "${connectionId}" not found`);
    }
    return conn.executeAction(actionName, parameters, options?.timeout);
  }

  getCapabilities(connectionId: string): ActionSchema[] {
    const conn = this.connections.get(connectionId);
    if (!conn) return [];
    return conn.getCapabilities();
  }

  getAllCapabilities(): { connectionId: string; capabilities: ActionSchema[] }[] {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      connectionId: id,
      capabilities: conn.getCapabilities(),
    }));
  }

  onCapabilitiesRegistered(
    callback: (connectionId: string, capabilities: ActionSchema[]) => void,
  ): () => void {
    const cleanups: (() => void)[] = [];
    for (const [id, conn] of this.connections) {
      cleanups.push(conn.on('capabilities', (caps) => callback(id, caps)));
    }
    return () => cleanups.forEach((c) => c());
  }

  onNotification(
    callback: (connectionId: string, event: NotificationEvent) => void,
  ): () => void {
    const cleanups: (() => void)[] = [];
    for (const [id, conn] of this.connections) {
      cleanups.push(conn.on('notification', (evt) => callback(id, evt)));
    }
    return () => cleanups.forEach((c) => c());
  }

  onStateSync(
    callback: (connectionId: string, snapshot: Record<string, unknown>) => void,
  ): () => void {
    const cleanups: (() => void)[] = [];
    for (const [id, conn] of this.connections) {
      cleanups.push(conn.on('stateSync', (snap) => callback(id, snap)));
    }
    return () => cleanups.forEach((c) => c());
  }

  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  destroyAll(): void {
    for (const [id, conn] of this.connections) {
      conn.destroy();
    }
    this.connections.clear();
  }

  getConnectedPeers(excludeConnectionId?: string): PeerInfo[] {
    const peers: PeerInfo[] = [];
    for (const [id, conn] of this.connections) {
      if (id !== excludeConnectionId && conn.getState() === 'connected') {
        peers.push({ connectionId: id, capabilities: conn.getCapabilities() });
      }
    }
    return peers;
  }

  private setupPeerRouting(connectionId: string, connection: Connection): void {
    connection.on('peerMessage', (msg) => {
      const target = this.connections.get(msg.targetConnectionId);
      if (!target || target.getState() !== 'connected') return;
      target.deliverPeerMessage({
        type: 'PEER_MESSAGE_DELIVERY',
        namespace: NAMESPACE,
        channel: msg.targetConnectionId,
        id: msg.id,
        fromConnectionId: connectionId,
        topic: msg.topic,
        payload: msg.payload,
        timestamp: Date.now(),
      });
    });

    connection.on('broadcast', (msg) => {
      for (const [id, conn] of this.connections) {
        if (id !== connectionId && conn.getState() === 'connected') {
          conn.deliverPeerMessage({
            type: 'PEER_MESSAGE_DELIVERY',
            namespace: NAMESPACE,
            channel: id,
            id: msg.id,
            fromConnectionId: connectionId,
            topic: msg.topic,
            payload: msg.payload,
            timestamp: Date.now(),
          });
        }
      }
    });

    connection.on('peerListRequest', (msg) => {
      connection.deliverPeerListResponse({
        type: 'PEER_LIST_RESPONSE',
        namespace: NAMESPACE,
        channel: connectionId,
        id: msg.id,
        peers: this.getConnectedPeers(connectionId),
        timestamp: Date.now(),
      });
    });
  }

  private notifyPeerChange(event: 'connected' | 'disconnected', changedConnectionId: string): void {
    const peer: PeerInfo = {
      connectionId: changedConnectionId,
      capabilities: event === 'connected'
        ? (this.connections.get(changedConnectionId)?.getCapabilities() ?? [])
        : [],
    };
    for (const [id, conn] of this.connections) {
      if (id !== changedConnectionId && conn.getState() === 'connected') {
        conn.deliverPeerChange({
          type: 'PEER_CHANGE',
          namespace: NAMESPACE,
          channel: id,
          event,
          peer,
          timestamp: Date.now(),
        });
      }
    }
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
