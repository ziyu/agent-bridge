import type {
  ActionSchema,
  BridgeMessage,
  ConnectionState,
  ConnectionStateEvent,
  NotificationEvent,
  ReplyMessage,
  Ack2Message,
} from '@agent-bridge/shared';
import {
  NAMESPACE,
  PROTOCOL_VERSION,
  DEFAULT_HANDSHAKE_TIMEOUT,
  DEFAULT_CALL_TIMEOUT,
  BridgeError,
  isSynMessage,
  isAck1Message,
  isAck2Message,
  isReplyMessage,
  isNotifyMessage,
  isStateSyncMessage,
  isCapabilitiesUpdateMessage,
  isDestroyMessage,
} from '@agent-bridge/shared';
import type { Sandbox } from './sandbox/types.js';
import { HostTransport } from './transport.js';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  actionName: string;
}

type EventMap = {
  stateChange: ConnectionStateEvent;
  capabilities: ActionSchema[];
  notification: NotificationEvent;
  stateSync: Record<string, unknown>;
};

type EventHandler<K extends keyof EventMap> = (data: EventMap[K]) => void;

export class Connection {
  readonly id: string;
  private state: ConnectionState = 'disconnected';
  private sandbox: Sandbox;
  private transport: HostTransport | null = null;
  private capabilities: ActionSchema[] = [];
  private pending = new Map<string, PendingCall>();
  private participantId = '';
  private remoteParticipantId = '';
  private listeners = new Map<keyof EventMap, Set<EventHandler<keyof EventMap>>>();

  constructor(id: string, sandbox: Sandbox) {
    this.id = id;
    this.sandbox = sandbox;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getCapabilities(): ActionSchema[] {
    return [...this.capabilities];
  }

  on<K extends keyof EventMap>(event: K, handler: EventHandler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as EventHandler<keyof EventMap>);
    return () => set.delete(handler as EventHandler<keyof EventMap>);
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach((h) => (h as EventHandler<K>)(data));
  }

  async handshake(
    targetWindow: Window,
    allowedOrigins: (string | RegExp)[],
    timeout = DEFAULT_HANDSHAKE_TIMEOUT,
  ): Promise<void> {
    this.setState('connecting');
    this.participantId = this.generateId();
    this.transport = new HostTransport(targetWindow, allowedOrigins);

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(synInterval);
        this.setState('error');
        reject(new BridgeError('HANDSHAKE_TIMEOUT', `Handshake timed out after ${timeout}ms`));
      }, timeout);

      const cleanup = this.transport!.onMessage((msg) => {
        if (msg.channel !== this.id) return;

        if (isSynMessage(msg)) {
          this.remoteParticipantId = msg.participantId;
          this.sendSyn();

          const isLeader = this.participantId > this.remoteParticipantId;
          if (isLeader) {
            this.sendAck1();
          }
        } else if (isAck1Message(msg)) {
          clearInterval(synInterval);
          this.sendAck2WithPort();
          this.finishHandshake(timer, cleanup, resolve);
        } else if (isAck2Message(msg)) {
          clearInterval(synInterval);
          this.capabilities = (msg as Ack2Message).capabilities;
          this.emit('capabilities', this.capabilities);
          this.finishHandshake(timer, cleanup, resolve);
        }
      });

      this.sendSyn();
      const synInterval = setInterval(() => this.sendSyn(), 100);
    });
  }

  private finishHandshake(
    timer: ReturnType<typeof setTimeout>,
    cleanup: () => void,
    resolve: () => void,
  ): void {
    clearTimeout(timer);
    cleanup();
    this.setState('connected');
    this.setupRuntimeHandlers();
    resolve();
  }

  private sendAck2WithPort(): void {
    const port2 = this.transport!.createMessageChannel();
    const origin = this.transport!.getTargetOrigin();
    this.transport!.sendViaWindow(
      {
        type: 'ACK2',
        namespace: NAMESPACE,
        channel: this.id,
        timestamp: Date.now(),
        capabilities: [],
      },
      origin,
      [port2],
    );
    this.transport!.activateMessageChannel();
  }

  async executeAction(
    actionName: string,
    parameters: Record<string, unknown>,
    timeout = DEFAULT_CALL_TIMEOUT,
  ): Promise<unknown> {
    if (this.state !== 'connected' || !this.transport) {
      throw new BridgeError('NOT_CONNECTED', 'Cannot execute action: not connected');
    }

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

  private setupRuntimeHandlers(): void {
    this.transport!.onMessage((msg) => {
      if (msg.channel !== this.id) return;

      if (isReplyMessage(msg)) {
        this.handleReply(msg as ReplyMessage);
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

  private handleReply(msg: ReplyMessage): void {
    const p = this.pending.get(msg.callId);
    if (!p) return;
    this.pending.delete(msg.callId);
    clearTimeout(p.timeoutId);

    if (msg.success) {
      p.resolve(msg.value);
    } else {
      p.reject(new BridgeError(
        msg.error.code as any,
        msg.error.message,
        msg.error.data,
      ));
    }
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

    this.transport?.destroy();
    this.transport = null;
    this.sandbox.unmount();
    this.setState('disconnected');
    this.listeners.clear();
  }

  private setState(next: ConnectionState): void {
    const previous = this.state;
    if (previous === next) return;
    this.state = next;
    this.emit('stateChange', { previous, current: next });
  }

  private sendSyn(): void {
    this.transport?.send({
      type: 'SYN',
      namespace: NAMESPACE,
      channel: this.id,
      timestamp: Date.now(),
      participantId: this.participantId,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  private sendAck1(): void {
    this.transport?.send({
      type: 'ACK1',
      namespace: NAMESPACE,
      channel: this.id,
      timestamp: Date.now(),
    });
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
