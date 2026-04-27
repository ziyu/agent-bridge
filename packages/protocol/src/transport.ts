import type { BridgeMessage } from './messages.js';

/**
 * Abstract transport interface.
 * Every concrete transport (postMessage, WebSocket, stdio, in-memory) must implement this.
 */
export interface Transport {
  send(message: BridgeMessage, transferables?: Transferable[]): void;
  onMessage(handler: (message: BridgeMessage) => void): () => void;
  destroy(): void;
}

/**
 * Transport that can actively initiate a connection.
 * E.g., WebSocket client, stdio process spawn.
 */
export interface ConnectableTransport extends Transport {
  connect(address: string | URL): Promise<void>;
}

/**
 * Transport that can passively accept connections.
 * E.g., WebSocket server, stdio listener.
 */
export interface ListenableTransport extends Transport {
  listen(
    address: string | URL,
    onConnection: (transport: Transport) => void,
  ): Promise<void>;
}
