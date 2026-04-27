import type { BridgeMessageType } from './messages.js';

export type ComplianceLevel = 'core' | 'notifications' | 'peer' | 'streaming';

export const COMPLIANCE_REQUIREMENTS: Record<ComplianceLevel, BridgeMessageType[]> = {
  core:          ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY'],
  notifications: ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY',
                  'NOTIFY', 'STATE_SYNC', 'CAPABILITIES_UPDATE'],
  peer:          ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY',
                  'NOTIFY', 'STATE_SYNC', 'CAPABILITIES_UPDATE',
                  'PEER_MESSAGE', 'BROADCAST', 'PEER_LIST_REQUEST',
                  'PEER_LIST_RESPONSE', 'PEER_CHANGE'],
  streaming:     [],
};
