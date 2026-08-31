import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The build output goes straight into ../public so the existing zero-dependency
// server.mjs keeps serving the app with no change to how it locates static files.
// In dev, `vite` runs on :5173 and proxies the JSON API to the Node server on :4700.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4700',
    },
  },
});
