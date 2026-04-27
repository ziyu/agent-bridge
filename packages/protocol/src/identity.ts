import type { ComplianceLevel } from './compliance.js';
import type { BridgeMessageType } from './messages.js';

export interface TransportPreference {
  type: string;
  version: string;
  address?: string;
}

export interface CapabilitiesDeclaration {
  complianceLevel: ComplianceLevel;
  supportedMessages: BridgeMessageType[];
  features: {
    toolCalling: boolean;
    stateSync: boolean;
    notifications: boolean;
    peerMessaging: boolean;
    broadcast: boolean;
    streaming: boolean;
  };
}

export interface AgentIdentity {
  id: string;
  name: string;
  protocolVersion: string;
  transports: TransportPreference[];
  capabilities: CapabilitiesDeclaration;
}
