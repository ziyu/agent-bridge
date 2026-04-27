// ── Message Types (protocol definitions) ──

import type { NAMESPACE } from './constants.js';

// ── Action Schema (LLM-compatible JSON Schema subset) ──

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

// ── Message Envelope ──

interface MessageBase {
  namespace: typeof NAMESPACE;
  channel: string;
  timestamp: number;
}

// ── Handshake Messages ──

export type SynMessage = MessageBase & {
  type: 'SYN';
  participantId: string;
  protocolVersion: string;
};

export type Ack1Message = MessageBase & {
  type: 'ACK1';
};

export type Ack2Message = MessageBase & {
  type: 'ACK2';
  capabilities: ActionSchema[];
};

// ── Runtime Messages ──

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

export type CapabilitiesUpdateMessage = MessageBase & {
  type: 'CAPABILITIES_UPDATE';
  capabilities: ActionSchema[];
};

export type DestroyMessage = MessageBase & {
  type: 'DESTROY';
};

// ── Peer Communication Messages ──

export type PeerMessage = MessageBase & {
  type: 'PEER_MESSAGE';
  id: string;
  targetConnectionId: string;
  fromConnectionId?: string;
  topic: string;
  payload: Record<string, unknown>;
};

export type PeerMessageDelivery = MessageBase & {
  type: 'PEER_MESSAGE_DELIVERY';
  id: string;
  fromConnectionId: string;
  topic: string;
  payload: Record<string, unknown>;
};

export type BroadcastMessage = MessageBase & {
  type: 'BROADCAST';
  id: string;
  fromConnectionId?: string;
  topic: string;
  payload: Record<string, unknown>;
};

export type PeerListRequest = MessageBase & {
  type: 'PEER_LIST_REQUEST';
  id: string;
};

export type PeerListResponse = MessageBase & {
  type: 'PEER_LIST_RESPONSE';
  id: string;
  peers: PeerInfo[];
};

export type PeerChangeNotification = MessageBase & {
  type: 'PEER_CHANGE';
  event: 'connected' | 'disconnected';
  peer: PeerInfo;
};

export interface PeerInfo {
  connectionId: string;
  capabilities: ActionSchema[];
}

// ── Discriminated Union ──

export type BridgeMessage =
  | SynMessage
  | Ack1Message
  | Ack2Message
  | CallMessage
  | ReplyMessage
  | NotifyMessage
  | StateSyncMessage
  | CapabilitiesUpdateMessage
  | DestroyMessage
  | PeerMessage
  | PeerMessageDelivery
  | BroadcastMessage
  | PeerListRequest
  | PeerListResponse
  | PeerChangeNotification;

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

// ── Mount Source (Host-specific, retained for backward compatibility) ──

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
