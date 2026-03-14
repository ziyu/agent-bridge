import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    treeshake: true,
    minify: true,
    splitting: false,
    sourcemap: false,
    external: [],
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'AgentBridgeClient',
    clean: false,
    treeshake: true,
    minify: true,
    splitting: false,
    sourcemap: false,
  },
]);
