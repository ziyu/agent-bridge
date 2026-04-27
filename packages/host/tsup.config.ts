import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  noExternal: ['@agent_bridge/shared', '@agent_bridge/protocol', '@agent_bridge/transport-postmessage'],
  define: {
    __CLIENT_BUNDLE__: JSON.stringify(
      readFileSync(resolve(__dirname, '../client/dist/index.global.js'), 'utf-8'),
    ),
  },
});
