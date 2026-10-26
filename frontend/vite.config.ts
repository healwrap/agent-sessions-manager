import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => {
            request.setHeader('origin', 'http://127.0.0.1:8765');
            request.removeHeader('sec-fetch-site');
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        browserCheck: fileURLToPath(
          new URL('./browser-check.html', import.meta.url),
        ),
      },
    },
  },
  test: { include: ['../tests/frontend/**/*.test.{ts,tsx}'] },
});
