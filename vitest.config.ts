import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@config': path.resolve(__dirname, 'config'),
    },
  },
  define: {
    __IS_OFFLINE_BUILD__: JSON.stringify(false),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    passWithNoTests: false,
  },
});
