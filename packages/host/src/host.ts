import type {
  ActionSchema,
  MountSource,
  SandboxConfig,
  NotificationEvent,
} from '@agent-bridge/shared';
import { DEFAULT_HANDSHAKE_TIMEOUT } from '@agent-bridge/shared';
import { Connection } from './connection.js';
import { IframeSandbox } from './sandbox/iframe.js';
import { InlineSandbox } from './sandbox/inline.js';

export class AgentBridgeHost {
  private connections = new Map<string, Connection>();

  async mount(source: MountSource, config: SandboxConfig): Promise<Connection> {
    const sandbox = source.type === 'uri' ? new IframeSandbox() : new InlineSandbox();
    const connectionId = this.generateId();
    const connection = new Connection(connectionId, sandbox);

    sandbox.mount(source as any, config);

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

    return connection;
  }

  unmount(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(connectionId);
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

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
