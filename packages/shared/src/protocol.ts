import type { NAMESPACE } from './constants.js';

// ── Action Schema (LLM-compatible) ──

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface ActionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: false;
  };
}

// ── Message Types ──

interface MessageBase {
  namespace: typeof NAMESPACE;
  channel: string;
  timestamp: number;
}

// Handshake
export type SynMessage = MessageBase & {
  type: 'SYN';
  participantId: string;
  protocolVersion: string;
};

export type Ack1Message = MessageBase & {
  type: 'ACK1';
  capabilities: ActionSchema[];
};

export type Ack2Message = MessageBase & {
  type: 'ACK2';
};

// Runtime
export type CallMessage = MessageBase & {
  type: 'CALL';
  id: string;
  actionName: string;
  parameters: Record<string, unknown>;
  timeout?: number;
};

export type ReplyMessage = MessageBase & {
  type: 'REPLY';
  callId: string;
} & (
  | { success: true; value: unknown }
  | { success: false; error: { code: string; message: string; data?: unknown } }
);

export type NotifyMessage = MessageBase & {
  type: 'NOTIFY';
  eventName: string;
  eventData: Record<string, unknown>;
  suggestion?: string;
};

export type StateSyncMessage = MessageBase & {
  type: 'STATE_SYNC';
  snapshot: Record<string, unknown>;
};

export type DestroyMessage = MessageBase & {
  type: 'DESTROY';
};

// Union
export type BridgeMessage =
  | SynMessage
  | Ack1Message
  | Ack2Message
  | CallMessage
  | ReplyMessage
  | NotifyMessage
  | StateSyncMessage
  | DestroyMessage;

export type BridgeMessageType = BridgeMessage['type'];

// ── Connection State ──

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionStateEvent {
  previous: ConnectionState;
  current: ConnectionState;
  error?: Error;
}

// ── Notification Event ──

export interface NotificationEvent {
  eventName: string;
  eventData: Record<string, unknown>;
  suggestion?: string;
}

// ── Transport Interface ──

export interface Transport {
  send(message: BridgeMessage, transferables?: Transferable[]): void;
  onMessage(handler: (message: BridgeMessage) => void): () => void;
  destroy(): void;
}

// ── Mount Source ──

export type MountSource =
  | { type: 'uri'; url: string }
  | { type: 'raw'; code: string; codeType?: 'html' | 'js' };

export interface SandboxConfig {
  container: HTMLElement;
  allowedOrigins?: (string | RegExp)[];
  handshakeTimeout?: number;
  sandbox?: string;
  permissions?: string[];
}
