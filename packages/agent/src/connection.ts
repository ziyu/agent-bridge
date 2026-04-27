import type {
  Transport,
  BridgeMessage,
  ActionSchema,
  ConnectionState,
  ConnectionStateEvent,
  NotificationEvent,
  PeerInfo,
} from '@agent_bridge/protocol';
import {
  NAMESPACE,
  DEFAULT_CALL_TIMEOUT,
  BridgeError,
  isReplyMessage,
  isNotifyMessage,
  isStateSyncMessage,
  isCapabilitiesUpdateMessage,
  isDestroyMessage,
  isCallMessage,
} from '@agent_bridge/protocol';
import { handshake } from './handshake.js';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  actionName: string;
};

type EventMap = {
  stateChange: ConnectionStateEvent;
  capabilities: ActionSchema[];
  notification: NotificationEvent;
  stateSync: Record<string, unknown>;
};

export class PeerConnection {
  readonly id: string;
  private transport: Transport | null;
  private state: ConnectionState = 'disconnected';
  private capabilities: ActionSchema[] = [];
  private pending = new Map<string, PendingCall>();
  private participantId: string;
  private remoteParticipantId = '';
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private getCapabilitiesSnapshot: () => ActionSchema[];
  private runtimeCleanup: (() => void) | null = null;

  constructor(
    id: string,
    transport: Transport,
    participantId: string,
    getCapabilitiesSnapshot: () => ActionSchema[],
  ) {
    this.id = id;
    this.transport = transport;
    this.participantId = participantId;
    this.getCapabilitiesSnapshot = getCapabilitiesSnapshot;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getRemoteParticipantId(): string {
    return this.remoteParticipantId;
  }

  getCapabilities(): ActionSchema[] {
    return [...this.capabilities];
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlerSet = this.listeners.get(event)!;
    const h = handler as (...args: any[]) => void;
    handlerSet.add(h);
    return () => handlerSet.delete(h);
  }

  async connect(timeout?: number): Promise<void> {
    if (!this.transport) throw new BridgeError('CONNECTION_DESTROYED', 'Connection destroyed');

    this.setState('connecting');

    const result = await handshake(
      this.transport,
      this.id,
      this.participantId,
      this.getCapabilitiesSnapshot,
      timeout,
    );

    this.remoteParticipantId = result.remoteParticipantId;
    this.capabilities = result.capabilities;

    this.setState('connected');
    this.setupRuntimeHandlers();

    if (result.capabilities.length > 0) {
      this.emit('capabilities', result.capabilities);
    }
  }

  async executeAction(actionName: string, parameters: Record<string, unknown>, timeout = DEFAULT_CALL_TIMEOUT): Promise<unknown> {
    if (!this.transport) throw new BridgeError('CONNECTION_DESTROYED', 'Connection destroyed');
    if (this.state !== 'connected') throw new BridgeError('NOT_CONNECTED', 'Cannot execute action: not connected');

    const id = this.generateId();
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError('CALL_TIMEOUT', `Action "${actionName}" timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timeoutId, actionName });

      this.transport!.send({
        type: 'CALL',
        namespace: NAMESPACE,
        channel: this.id,
        id,
        actionName,
        parameters,
        timeout,
        timestamp: Date.now(),
      });
    });
  }

  send(message: BridgeMessage): void {
    if (!this.transport) throw new BridgeError('CONNECTION_DESTROYED', 'Connection destroyed');
    this.transport.send(message);
  }

  destroy(): void {
    if (this.state === 'connected' && this.transport) {
      this.transport.send({
        type: 'DESTROY',
        namespace: NAMESPACE,
        channel: this.id,
        timestamp: Date.now(),
      });
    }

    for (const [, p] of this.pending) {
      clearTimeout(p.timeoutId);
      p.reject(new BridgeError('CONNECTION_DESTROYED', 'Connection was destroyed'));
    }
    this.pending.clear();

    this.runtimeCleanup?.();
    this.runtimeCleanup = null;
    this.transport?.destroy();
    this.transport = null;
    this.setState('disconnected');
    this.listeners.clear();
  }

  private setupRuntimeHandlers(): void {
    if (!this.transport) return;
    this.runtimeCleanup = this.transport.onMessage((msg) => {
      if (isReplyMessage(msg)) {
        this.handleReply(msg as any);
      } else if (isCapabilitiesUpdateMessage(msg)) {
        this.capabilities = msg.capabilities;
        this.emit('capabilities', this.capabilities);
      } else if (isNotifyMessage(msg)) {
        this.emit('notification', {
          eventName: msg.eventName,
          eventData: msg.eventData,
          suggestion: msg.suggestion,
        });
      } else if (isStateSyncMessage(msg)) {
        this.emit('stateSync', msg.snapshot);
      } else if (isDestroyMessage(msg)) {
        this.destroy();
      }
    });
  }

  private handleReply(msg: { callId: string; success: boolean; value?: unknown; error?: { code: string; message: string; data?: unknown } }): void {
    const p = this.pending.get(msg.callId);
    if (!p) return;
    this.pending.delete(msg.callId);
    clearTimeout(p.timeoutId);

    if (msg.success) {
      p.resolve(msg.value);
    } else {
      p.reject(new BridgeError(
        msg.error?.code as any ?? 'ACTION_EXECUTION_ERROR',
        msg.error?.message ?? 'Unknown error',
        msg.error?.data,
      ));
    }
  }

  private setState(next: ConnectionState): void {
    const previous = this.state;
    if (previous === next) return;
    this.state = next;
    this.emit('stateChange', { previous, current: next });
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach((h) => h(data));
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
