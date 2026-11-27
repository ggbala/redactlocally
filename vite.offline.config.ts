import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Standalone single-HTML offline build configuration.
 * Invoked by `scripts/build-offline-html.mjs` (`npm run build:offline`).
 * Bundles all JS, CSS, SVG, and rule JSONs inline with zero external CDN links.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({
      removeViteModuleLoader: true,
    }),
  ],
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@config': path.resolve(__dirname, 'config'),
    },
  },
  define: {
    __IS_OFFLINE_BUILD__: JSON.stringify(true),
  },
  build: {
    outDir: 'dist-offline',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
