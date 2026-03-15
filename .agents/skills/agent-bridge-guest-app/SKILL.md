---
name: agent-bridge-guest-app
description: |
  Use when generating AgentBridge guest app HTML, creating sandboxed iframe content
  for an AgentBridge host, wiring BridgeClient SDK communication, or building
  AI-callable tool UIs that run inside AgentBridge. Triggers on: 'generate guest app',
  'create guest app', 'build agent bridge app', 'mount guest', 'register action',
  'AgentBridge', 'BridgeClient', or any request to create UI that an AI/LLM can
  interact with via tool-calling through the AgentBridge SDK.
---

# AgentBridge Guest App Generation

## Core Concept

A guest app is self-contained HTML+JS that runs inside a sandboxed iframe managed by an AgentBridge host. The guest registers "actions" (capabilities the AI can call), and the host routes LLM tool-calls to those actions.

**IoC principle**: Guest apps contain ZERO network requests, ZERO LLM API calls, ZERO context management. They only declare what they can do and report what the user did. The host handles everything else.

---

## Quick Start Decision Tree

| Question | Answer | Use |
|----------|--------|-----|
| Is the guest code generated at runtime by AI? | Yes | **Inline mode** (`type: 'raw'`) |
| Is the guest a pre-deployed web app? | Yes | **URI mode** (`type: 'uri'`) |
| Does the guest need to talk to other guests? | Yes | Add **peer APIs** |
| Is this for LLM tool-calling? | Yes | Add **`notifyHost` with suggestion** |
| Does the host need current guest state? | Yes | Add **`syncState`** calls |

---

## Step 0: Read SDK Source (MANDATORY)

Before generating any guest app code, read these files from the project:

| File | What to learn |
|------|---------------|
| `packages/client/src/client.ts` | Full BridgeClient API, method signatures |
| `packages/host/src/host.ts` | `mount()`, `executeAction()`, connection events |
| `packages/shared/src/protocol.ts` | All message types, ActionSchema interface |

---

## Guest App Template

Use this template as the starting point. **DO NOT generate from scratch.**

```html
<!DOCTYPE html>
<html>
<head><style>
  /* ── VARIABLE: your styles here ── */
  body { font-family: system-ui, sans-serif; padding: 16px; }
</style></head>
<body>
  <!-- ── VARIABLE: your UI markup here ── -->
  <div id="app">Loading...</div>

  <script>
    // ══════════════════════════════════════════════════════════
    // FIXED: SDK instantiation — NEVER change this line
    // ══════════════════════════════════════════════════════════
    const client = new AgentBridgeClient.BridgeClient();

    // ══════════════════════════════════════════════════════════
    // VARIABLE: Register your actions — MUST be before initialize()
    // ══════════════════════════════════════════════════════════
    client.registerAction(
      'actionName',                     // VARIABLE: unique name [a-zA-Z0-9_-]
      'Human/LLM-readable description', // VARIABLE: what this action does
      {                                 // VARIABLE: JSON Schema for parameters
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'What this param does' }
        },
        required: ['param1'],
      },
      (params) => {                     // VARIABLE: action implementation
        // Return value (sync or async) becomes the tool result
        return { result: params.param1 };
      }
    );

    // ══════════════════════════════════════════════════════════
    // FIXED: Initialize — ALWAYS call after all registerAction()
    // ══════════════════════════════════════════════════════════
    client.initialize().then(() => {
      // ── VARIABLE: post-connection setup ──
      document.getElementById('app').textContent = 'Connected';
      client.notifyHost('ready', { timestamp: Date.now() });
      client.syncState({ status: 'ready' });
    });
  </script>
</body>
</html>
```

### What's FIXED (never change)

- `new AgentBridgeClient.BridgeClient()` — exact global name, no import
- `registerAction()` calls come BEFORE `initialize()`
- `client.initialize()` is always the last SDK setup call
- Overall structure: styles in `<head>`, markup in `<body>`, single `<script>` block

### What's VARIABLE (fill per use case)

- CSS styles
- HTML markup
- Action names, descriptions, schemas, and callbacks
- Post-connection logic inside `.then()`
- `notifyHost` / `syncState` calls

---

## BridgeClient API Reference

### Core Lifecycle

| Method | Signature | When |
|--------|-----------|------|
| `registerAction` | `(name, description, schema, callback) => void` | Before `initialize()` |
| `initialize` | `() => Promise<void>` | After all actions registered |
| `destroy` | `() => void` | On cleanup |

### Host Communication

| Method | Signature | Purpose |
|--------|-----------|---------|
| `notifyHost` | `(eventName, data, suggestion?) => void` | Report user events to host/LLM |
| `syncState` | `(snapshot: Record<string, unknown>) => void` | Push full state to host |

### Peer Communication (multi-guest only)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `sendToPeer` | `(targetId, topic, payload) => void` | Direct message to one guest |
| `broadcast` | `(topic, payload) => void` | Message all other guests |
| `getPeers` | `() => Promise<PeerInfo[]>` | List connected peers |
| `onPeerMessage` | `(handler) => () => void` | Subscribe to peer messages |
| `onPeerChange` | `(handler) => () => void` | Subscribe to peer connect/disconnect |

---

## Action Schema Patterns

### String with enum

```javascript
{
  type: 'object',
  properties: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'], description: 'Theme name' }
  },
  required: ['theme']
}
```

### Array of items

```javascript
{
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' }, description: 'List of items' }
  },
  required: ['items']
}
```

### Nested object

```javascript
{
  type: 'object',
  properties: {
    position: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    }
  },
  required: ['position']
}
```

### No parameters

```javascript
{ type: 'object', properties: {} }
```

---

## Host Side Patterns

### Mount and wire up

```javascript
import { AgentBridgeHost, toOpenAITool } from '@agent_bridge/host';

const host = new AgentBridgeHost();
const conn = await host.mount(
  { type: 'raw', code: guestHtml, codeType: 'html' },
  { container: document.getElementById('sandbox') }
);

// Get guest capabilities as LLM tools
conn.on('capabilities', (caps) => {
  const tools = caps.map(toOpenAITool);
  // Also available: toAnthropicTool, toGeminiTool
});

// Listen for user events
conn.on('notification', (evt) => {
  // evt.eventName, evt.eventData, evt.suggestion
});

// Listen for state updates
conn.on('stateSync', (snapshot) => {
  // Full state snapshot from guest
});

// Execute LLM tool call on guest
const result = await host.executeAction(conn.id, 'actionName', { param1: 'value' });
```

### LLM tool-calling loop

```javascript
// 1. Get tools from guest capabilities
const tools = caps.map(toOpenAITool);

// 2. Call LLM with tools
const response = await llm.chat({ messages, tools });

// 3. Execute each tool call
for (const call of response.tool_calls) {
  const result = await host.executeAction(
    conn.id,
    call.function.name,
    JSON.parse(call.function.arguments)
  );
  // 4. Feed result back to LLM as tool message
  messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
}
```

---

## Complete Examples

### Example 1: Calculator widget

```javascript
const guestHtml = `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; padding: 16px; background: #f0fdf4; }
  #output { font-family: monospace; margin-top: 8px; }
</style></head><body>
  <h3>Calculator</h3>
  <div id="output">Ready</div>
  <script>
    const client = new AgentBridgeClient.BridgeClient();

    client.registerAction('calculate', 'Evaluate a math expression', {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'e.g. "2 + 3 * 4"' }
      },
      required: ['expression'],
    }, (params) => {
      try {
        const result = Function('"use strict"; return (' + params.expression + ')')();
        document.getElementById('output').textContent = params.expression + ' = ' + result;
        return { result };
      } catch (e) { return { error: e.message }; }
    });

    client.initialize().then(() => {
      client.notifyHost('ready', { widget: 'calculator' });
    });
  ${'<'}/script>
</body></html>`;
```

### Example 2: Stateful form with notifications

```javascript
const guestHtml = `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; padding: 16px; }
  input, select { display: block; width: 100%; padding: 6px; margin-bottom: 8px;
    border: 1px solid #ddd; border-radius: 4px; }
  button { padding: 6px 14px; background: #2563eb; color: #fff;
    border: none; border-radius: 4px; cursor: pointer; }
</style></head><body>
  <input id="name" placeholder="Name" />
  <select id="role"><option value="user">User</option><option value="admin">Admin</option></select>
  <button id="submit">Submit</button>
  <script>
    const client = new AgentBridgeClient.BridgeClient();
    let formData = { name: '', role: 'user' };

    client.registerAction('prefillForm', 'Pre-fill form fields', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        role: { type: 'string', enum: ['user', 'admin'] }
      },
    }, (params) => {
      if (params.name) document.getElementById('name').value = params.name;
      if (params.role) document.getElementById('role').value = params.role;
      formData = { ...formData, ...params };
      client.syncState({ formData });
      return { prefilled: params };
    });

    client.registerAction('clearForm', 'Clear all fields', {
      type: 'object', properties: {},
    }, () => {
      document.getElementById('name').value = '';
      document.getElementById('role').value = 'user';
      formData = { name: '', role: 'user' };
      client.syncState({ formData });
      return { cleared: true };
    });

    document.getElementById('submit').addEventListener('click', () => {
      formData = {
        name: document.getElementById('name').value,
        role: document.getElementById('role').value,
      };
      client.notifyHost('formSubmitted', { formData },
        'User submitted the form. Please validate and process.');
    });

    client.initialize().then(() => {
      client.syncState({ formData });
    });
  ${'<'}/script>
</body></html>`;
```

### Example 3: Multi-guest with peer messaging

```javascript
function makeGuestCode(name, color) {
  return `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; padding: 12px; background: ${color}11; }
  h3 { color: ${color}; font-size: 14px; }
  #msgs { font-size: 11px; font-family: monospace; max-height: 80px; overflow-y: auto; }
</style></head><body>
  <h3>${name}</h3>
  <div id="status">Connecting...</div>
  <div id="msgs"></div>
  <script>
    const client = new AgentBridgeClient.BridgeClient();

    client.registerAction('echo', 'Echo a message', {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    }, (params) => ({ echo: '${name}: ' + params.text }));

    client.onPeerMessage((msg) => {
      const el = document.createElement('div');
      el.textContent = '[' + msg.topic + '] ' + JSON.stringify(msg.payload);
      document.getElementById('msgs').prepend(el);
    });

    client.onPeerChange((event, peer) => {
      const el = document.createElement('div');
      el.style.color = event === 'connected' ? 'green' : 'red';
      el.textContent = 'Peer ' + event + ': ' + peer.connectionId.slice(0,8);
      document.getElementById('msgs').prepend(el);
    });

    client.initialize().then(() => {
      document.getElementById('status').textContent = 'Connected';
      client.notifyHost('ready', { name: '${name}' });
    });
  ${'<'}/script>
</body></html>`;
}
```

---

## Common Mistakes

1. **Importing SDK in inline mode** — In inline/raw mode, the host auto-injects the IIFE. Use `new AgentBridgeClient.BridgeClient()` directly. Never `import`.

2. **Calling `initialize()` before `registerAction()`** — Actions registered after `initialize()` require a separate CAPABILITIES_UPDATE round-trip. Always register first.

3. **`</script>` in template literals** — When guest HTML is inside a JS template literal, the browser sees `</script>` and closes the outer script tag. Use `${'<'}/script>` to break the token:
   ```javascript
   // WRONG — breaks the outer <script> block
   const html = `<script>...</script>`;

   // CORRECT — template expression breaks the closing tag token
   const html = `<script>...${'<'}/script>`;
   ```

4. **`syncState` as diff** — `syncState` sends a FULL snapshot, not a diff. Always send the complete current state.

5. **Peer APIs when not connected** — `sendToPeer`, `broadcast`, `getPeers` throw `BridgeError('NOT_CONNECTED')` if called before `initialize()` resolves.

6. **Cross-origin iframe access** — Never try to access `iframe.contentWindow` properties from the host page. Use the AgentBridge API (`executeAction`, `conn.on(...)`) for all communication.

7. **Missing `codeType: 'html'`** — When mounting raw HTML, always specify `{ type: 'raw', code: html, codeType: 'html' }`. Omitting `codeType` defaults to `'js'`.

---

## URI Mode (Pre-deployed Guest)

For guests deployed as separate web apps:

```javascript
// Guest app (separate file, uses npm package)
import { BridgeClient } from '@agent_bridge/client';

const client = new BridgeClient();
client.registerAction('myAction', '...', schema, callback);
await client.initialize();
```

```javascript
// Host mounts via URL
const conn = await host.mount(
  { type: 'uri', url: 'https://my-guest.example.com' },
  { container: el, allowedOrigins: ['https://my-guest.example.com'] }
);
```

**Key difference**: URI mode requires explicit `allowedOrigins` for security. Inline mode uses `'*'` by default since the iframe is same-origin via srcdoc.
