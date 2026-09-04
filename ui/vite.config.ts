import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

/**
 * The Midnight-specific half of this config is ported from
 * `midnight-leaderboard/leaderboard-ui/vite.config.ts`. It is load-bearing and
 * non-obvious: `@midnight-ntwrk/compact-runtime` pulls in `onchain-runtime-v3`,
 * which is a wasm module with top-level await. Without `wasm()`, the
 * `optimizeDeps` excludes, and `minify: false`, the contract fails to load in
 * the browser with errors that point nowhere near the real cause.
 *
 * `vite-plugin-top-level-await` is deliberately NOT used, unlike the
 * leaderboard's config: it crashes at `generateBundle` with a current @swc/core
 * ("missing field `type`"). It is only needed to transpile top-level await for
 * older targets, and we build for `esnext`, where browsers support it natively.
 */
export default defineConfig({
  cacheDir: './.vite',
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    {
      // compact-runtime imports the wasm runtime in a way Rollup will otherwise
      // try to externalise. Force it to be bundled, with side effects kept.
      name: 'wasm-module-resolver',
      resolveId(source, importer) {
        if (
          source === '@midnight-ntwrk/onchain-runtime-v3' &&
          importer &&
          importer.includes('@midnight-ntwrk/compact-runtime')
        ) {
          return { id: source, external: false, moduleSideEffects: true };
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The compiled contract lives in a sibling package with its own
      // node_modules. Pin the Midnight runtime to THIS package's copy, or the
      // contract is constructed by one instance of the wasm module and read by
      // another -- and `instanceof ChargedState` fails across the two, with a
      // "expected instance of ChargedState" that names nothing useful.
      '@midnight-ntwrk/compact-runtime': path.resolve(
        __dirname,
        './node_modules/@midnight-ntwrk/compact-runtime',
      ),
      '@midnight-ntwrk/onchain-runtime-v3': path.resolve(
        __dirname,
        './node_modules/@midnight-ntwrk/onchain-runtime-v3',
      ),
    },
    dedupe: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
  build: {
    target: 'esnext',
    minify: false,
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          wasm: ['@midnight-ntwrk/onchain-runtime-v3'],
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      supported: { 'top-level-await': true },
      platform: 'browser',
      format: 'esm',
      loader: { '.wasm': 'binary' },
    },
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
    ],
  },
  server: { port: 3000, fs: { allow: ['..'] } },
});
