import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app lives in web/ and builds into dist/, which server.js serves.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
