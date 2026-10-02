import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the Aether engine core.
 *
 * Tests target the pure, framework-agnostic logic modules (serialize/*,
 * logic/NodeGraphConverter, logic/ScriptSandbox, ...) so they run in a plain
 * Node environment without Three.js, canvas or DOM.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    },
  },
});
