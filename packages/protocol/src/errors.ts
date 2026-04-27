/** Standardized error codes for all AgentBridge protocol operations. */
export type BridgeErrorCode =
  | 'HANDSHAKE_TIMEOUT'
  | 'CALL_TIMEOUT'
  | 'NOT_CONNECTED'
  | 'CONNECTION_DESTROYED'
  | 'ACTION_NOT_FOUND'
  | 'ACTION_EXECUTION_ERROR'
  | 'INVALID_PARAMETERS'
  | 'SANDBOX_CRASH'
  | 'PROTOCOL_ERROR'
  | 'TRANSPORT_ERROR'
  | 'AUTH_ERROR'
  | 'AUTHORIZATION_ERROR';

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly data?: unknown;

  constructor(code: BridgeErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.data = data;
  }

  toJSON() {
    return { code: this.code, message: this.message, data: this.data };
  }
}
